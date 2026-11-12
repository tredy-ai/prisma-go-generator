// Prisma's query input types (where, order by, create, update, select, include) as plain Go
// structs. The set of types and their names follow Prisma's own input surface, as mapped out by
// Lexmata's prisma-rust-generator; the shared filters are generic over the column's Go type.
import type { DMMF } from '@prisma/generator-helper';
import { INPUT_FAMILIES, type Config, type InputFamily } from './config.js';
import { toPascalCase } from './naming.js';
import { baseType } from './types.js';
import type { Decl } from './render.js';

type Field = [goName: string, type: string, jsonTag: string];

const optional = (name: string): string => `${name},omitempty`;

function struct(doc: string, name: string, fields: Field[]): string {
  const taken = new Set<string>();
  for (const [goName] of fields) {
    if (taken.has(goName)) throw new Error(`prisma-go-generator: ${name} would have two fields named ${goName}`);
    taken.add(goName);
  }
  return [`// ${doc}`, `type ${name} struct {`, ...fields.map(([n, type, tag]) => `\t${n} ${type} \`json:"${tag}"\``), '}'].join('\n');
}

function stringEnum(doc: string, name: string, values: string[]): string {
  const constants = values.map((v) => `\t${name}${toPascalCase(v)} ${name} = "${v}"`);
  return [`// ${doc}`, `type ${name} string`, '', 'const (', ...constants, ')'].join('\n');
}

function filter(doc: string, name: string, t: string, kind: { range?: boolean; string?: boolean; nullable?: boolean }): string {
  const self = name.replace('[T any]', '[T]');
  const fields: Field[] = [
    ['Equals', `*${t}`, optional('equals')],
    ['In', `[]${t}`, optional('in')],
    ['NotIn', `[]${t}`, optional('notIn')],
  ];
  if (kind.nullable) fields.push(['IsNull', '*bool', optional('isNull')]);
  if (kind.range) {
    for (const op of ['Lt', 'Lte', 'Gt', 'Gte']) fields.push([op, `*${t}`, optional(op.toLowerCase())]);
  }
  if (kind.string) {
    fields.push(['Contains', '*string', optional('contains')]);
    fields.push(['StartsWith', '*string', optional('startsWith')]);
    fields.push(['EndsWith', '*string', optional('endsWith')]);
    fields.push(['Mode', 'QueryMode', optional('mode')]);
  }
  fields.push(['Not', `*${self}`, optional('not')]);
  return struct(doc, name, fields);
}

function numericUpdate(doc: string, name: string, set: string): string {
  const ops = ['Increment', 'Decrement', 'Multiply', 'Divide'].map((op): Field => [op, '*T', optional(op.toLowerCase())]);
  return struct(doc, name, [['Set', set, optional('set')], ...ops]);
}

/** Types shared by every model, per input family: [Go type name, declaration]. */
const SHARED: Partial<Record<InputFamily, [name: string, code: string][]>> = {
  where: [
    ['QueryMode', stringEnum('QueryMode is the case sensitivity of a string filter.', 'QueryMode', ['default', 'insensitive'])],
    ['Filter', filter('Filter matches a column of Go type T by equality. Every operator that is set must hold.', 'Filter[T any]', 'T', {})],
    ['NullableFilter', filter('NullableFilter is Filter for a nullable column.', 'NullableFilter[T any]', 'T', { nullable: true })],
    ['RangeFilter', filter('RangeFilter is Filter plus the ordering operators.', 'RangeFilter[T any]', 'T', { range: true })],
    [
      'NullableRangeFilter',
      filter('NullableRangeFilter is RangeFilter for a nullable column.', 'NullableRangeFilter[T any]', 'T', { range: true, nullable: true }),
    ],
    ['StringFilter', filter('StringFilter is RangeFilter[string] plus the substring operators.', 'StringFilter', 'string', { range: true, string: true })],
    [
      'StringNullableFilter',
      filter('StringNullableFilter is StringFilter for a nullable column.', 'StringNullableFilter', 'string', {
        range: true,
        string: true,
        nullable: true,
      }),
    ],
    [
      'ListFilter',
      struct('ListFilter matches a scalar list column.', 'ListFilter[T any]', [
        ['Equals', '[]T', optional('equals')],
        ['Has', '*T', optional('has')],
        ['HasEvery', '[]T', optional('hasEvery')],
        ['HasSome', '[]T', optional('hasSome')],
        ['IsEmpty', '*bool', optional('isEmpty')],
      ]),
    ],
  ],
  orderBy: [['SortOrder', stringEnum('SortOrder is the direction of an order-by clause.', 'SortOrder', ['asc', 'desc'])]],
  update: [
    ['FieldUpdate', struct('FieldUpdate sets a column of Go type T.', 'FieldUpdate[T any]', [['Set', 'T', 'set']])],
    [
      'NullableFieldUpdate',
      struct('NullableFieldUpdate sets a nullable column. A nil Set stores NULL.', 'NullableFieldUpdate[T any]', [['Set', '*T', 'set']]),
    ],
    [
      'NumericFieldUpdate',
      numericUpdate('NumericFieldUpdate sets a numeric column or changes it in place. Set one operation.', 'NumericFieldUpdate[T any]', '*T'),
    ],
    [
      'NullableNumericFieldUpdate',
      numericUpdate(
        'NullableNumericFieldUpdate is NumericFieldUpdate for a nullable column. Set points at the new\n// value; a pointer to a nil *T stores NULL.',
        'NullableNumericFieldUpdate[T any]',
        '**T',
      ),
    ],
    [
      'ListFieldUpdate',
      struct('ListFieldUpdate replaces a scalar list column or appends to it.', 'ListFieldUpdate[T any]', [
        ['Set', '[]T', optional('set')],
        ['Push', '[]T', optional('push')],
      ]),
    ],
  ],
};

const selected = (cfg: Config): InputFamily[] => INPUT_FAMILIES.filter((family) => cfg.inputs.includes(family));

/** Declarations every model's inputs depend on. */
export function sharedInputs(cfg: Config): string[] {
  return selected(cfg).flatMap((family) => (SHARED[family] ?? []).map(([, code]) => code));
}

const ORDERED = new Set(['Int', 'BigInt', 'Float', 'Decimal', 'DateTime']);
const NUMERIC = new Set(['Int', 'BigInt', 'Float', 'Decimal']);

function whereFilter(field: DMMF.Field, t: string): string {
  if (field.isList) return `ListFilter[${t}]`;
  const nullable = !field.isRequired;
  const isText = field.kind === 'scalar' && field.type === 'String' && field.nativeType?.[0] !== 'Uuid';
  if (isText && t === 'string') return nullable ? 'StringNullableFilter' : 'StringFilter';
  const range = isText || (field.kind === 'scalar' && ORDERED.has(field.type));
  return `${nullable ? 'Nullable' : ''}${range ? 'Range' : ''}Filter[${t}]`;
}

function updateOperation(field: DMMF.Field, t: string): string {
  if (field.isList) return `ListFieldUpdate[${t}]`;
  const numeric = field.kind === 'scalar' && NUMERIC.has(field.type);
  return `${field.isRequired ? '' : 'Nullable'}${numeric ? 'Numeric' : ''}FieldUpdate[${t}]`;
}

function uniqueColumns(m: DMMF.Model): Set<string> {
  const names = new Set<string>(m.primaryKey?.fields ?? []);
  for (const group of m.uniqueFields ?? []) group.forEach((name) => names.add(name));
  for (const index of m.uniqueIndexes ?? []) index.fields.forEach((name) => names.add(name));
  for (const field of m.fields) if (field.isId || field.isUnique) names.add(field.name);
  return names;
}

/** Go type names modelInputs declares for a model. */
export function modelInputNames(m: DMMF.Model, cfg: Config): string[] {
  const model = toPascalCase(m.name, cfg.initialisms);
  const names: Record<InputFamily, string[]> = {
    where: [`${model}WhereInput`, ...(cfg.relations ? [`${model}RelationFilter`, `${model}ListRelationFilter`] : [])],
    whereUnique: [`${model}WhereUniqueInput`],
    orderBy: [`${model}OrderByWithRelationInput`],
    create: [`${model}UncheckedCreateInput`],
    update: [`${model}UncheckedUpdateInput`],
    select: [`${model}Select`],
    include: [`${model}Include`],
  };
  return selected(cfg).flatMap((family) => names[family]);
}

/** Go type names sharedInputs declares. */
export function sharedInputNames(cfg: Config): string[] {
  return selected(cfg).flatMap((family) => (SHARED[family] ?? []).map(([name]) => name));
}

/** The input types of one model, for the families the config asks for. */
export function modelInputs(m: DMMF.Model, cfg: Config): Decl[] {
  const model = toPascalCase(m.name, cfg.initialisms);
  const imports: string[] = [];
  const goName = (field: DMMF.Field): string => toPascalCase(field.name, cfg.initialisms);
  const goType = (field: DMMF.Field): string => {
    const type = baseType(field, cfg);
    imports.push(...type.imports);
    return type.expr;
  };
  const columns = m.fields.filter((field) => field.kind !== 'object');
  const relations = cfg.relations ? m.fields.filter((field) => field.kind === 'object') : [];
  const target = (field: DMMF.Field): string => toPascalCase(field.type, cfg.initialisms);

  const families: Record<InputFamily, () => string[]> = {
    where: () => {
      const out = [
        struct(`${model}WhereInput filters ${model} rows. Every condition that is set must hold.`, `${model}WhereInput`, [
          ...columns.map((f): Field => [goName(f), `*${whereFilter(f, goType(f))}`, optional(f.name)]),
          ...relations.map((f): Field => [goName(f), `*${target(f)}${f.isList ? 'ListRelationFilter' : 'RelationFilter'}`, optional(f.name)]),
          ['AND', `[]${model}WhereInput`, optional('AND')],
          ['OR', `[]${model}WhereInput`, optional('OR')],
          ['NOT', `[]${model}WhereInput`, optional('NOT')],
        ]),
      ];
      if (cfg.relations) {
        out.push(
          struct(`${model}RelationFilter filters through a to-one relation to ${model}.`, `${model}RelationFilter`, [
            ['Is', `*${model}WhereInput`, optional('is')],
            ['IsNot', `*${model}WhereInput`, optional('isNot')],
          ]),
          struct(`${model}ListRelationFilter filters through a to-many relation to ${model}.`, `${model}ListRelationFilter`, [
            ['Some', `*${model}WhereInput`, optional('some')],
            ['Every', `*${model}WhereInput`, optional('every')],
            ['None', `*${model}WhereInput`, optional('none')],
          ]),
        );
      }
      return out;
    },
    whereUnique: () => {
      const unique = uniqueColumns(m);
      return [
        struct(
          `${model}WhereUniqueInput identifies one ${model} row by its id or a unique column.`,
          `${model}WhereUniqueInput`,
          columns.filter((f) => unique.has(f.name) && !f.isList).map((f): Field => [goName(f), `*${goType(f)}`, optional(f.name)]),
        ),
      ];
    },
    orderBy: () => [
      struct(`${model}OrderByWithRelationInput orders ${model} rows. Use a slice of these to order by several columns.`, `${model}OrderByWithRelationInput`, [
        ...columns.map((f): Field => [goName(f), 'SortOrder', optional(f.name)]),
        ...relations.filter((f) => !f.isList).map((f): Field => [goName(f), `*${target(f)}OrderByWithRelationInput`, optional(f.name)]),
      ]),
    ],
    create: () => [
      struct(
        `${model}UncheckedCreateInput is the data for a new ${model} row. Columns with a default are optional.`,
        `${model}UncheckedCreateInput`,
        columns.map((f): Field => {
          if (f.isList) return [goName(f), `[]${goType(f)}`, optional(f.name)];
          const required = f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt;
          return required ? [goName(f), goType(f), f.name] : [goName(f), `*${goType(f)}`, optional(f.name)];
        }),
      ),
    ],
    update: () => [
      struct(
        `${model}UncheckedUpdateInput changes the columns that are set and leaves the rest alone.`,
        `${model}UncheckedUpdateInput`,
        columns.map((f): Field => [goName(f), `*${updateOperation(f, goType(f))}`, optional(f.name)]),
      ),
    ],
    select: () => [
      struct(
        `${model}Select picks the fields of ${model} to return.`,
        `${model}Select`,
        [...columns, ...relations].map((f): Field => [goName(f), 'bool', optional(f.name)]),
      ),
    ],
    include: () =>
      relations.length === 0
        ? []
        : [
            struct(
              `${model}Include picks the relations of ${model} to load.`,
              `${model}Include`,
              relations.map((f): Field => [goName(f), 'bool', optional(f.name)]),
            ),
          ],
  };

  return selected(cfg)
    .flatMap((family) => families[family]())
    .map((code) => ({ code, imports }));
}
