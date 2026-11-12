import type { DMMF } from '@prisma/generator-helper';
import type { Config, StructTag } from './config.js';
import { toCamelCase, toEnumConstName, toPascalCase, toSnakeCase } from './naming.js';
import { fieldType } from './types.js';

/** A top-level Go declaration and the import paths it needs. */
export interface Decl {
  code: string;
  imports: string[];
}

export function renderEnum(e: DMMF.DatamodelEnum, cfg: Config): string {
  const name = toPascalCase(e.name, cfg.initialisms);
  const lines: string[] = [];
  if (cfg.enumDirective) lines.push(`//go:generate ${cfg.enumDirective.replaceAll('{name}', name)}`);
  lines.push(`type ${name} ${cfg.enumType}`, '', 'const (');
  e.values.forEach((value, i) => {
    const constant = toEnumConstName(name, value.name, cfg.initialisms);
    const label = value.dbName ?? value.name;
    // An integer constant carries its database label as a line comment, which `enumer -linecomment`
    // (and stringer's) uses as the value's text. A label with a line break cannot be a line comment.
    const comment = /[\r\n]/.test(label) ? '' : ` // ${label}`;
    if (cfg.enumType === 'string') lines.push(`\t${constant} ${name} = ${JSON.stringify(label)}`);
    else if (i === 0) lines.push(`\t${constant} ${name} = iota${cfg.enumStart > 0 ? ` + ${cfg.enumStart}` : ''}${comment}`);
    else lines.push(`\t${constant}${comment}`);
  });
  lines.push(')');
  return lines.join('\n');
}

function tagName(tag: StructTag, field: DMMF.Field, goName: string): string {
  switch (tag.naming) {
    case 'field':
      return field.name;
    case 'column':
      return field.dbName ?? field.name;
    case 'snake':
      return toSnakeCase(field.name);
    case 'camel':
      return toCamelCase(field.name);
    case 'pascal':
      return goName;
  }
}

function structTag(tag: StructTag, field: DMMF.Field, goName: string, cfg: Config): string {
  if (field.kind === 'object') {
    // A relation is not a column, and is only present once the caller has loaded it.
    return tag.naming === 'column' ? `${tag.key}:"-"` : `${tag.key}:"${tagName(tag, field, goName)},omitempty"`;
  }
  const omit = cfg.omitempty.has(tag.key) && (!field.isRequired || field.hasDefaultValue);
  return `${tag.key}:"${tagName(tag, field, goName)}${omit ? ',omitempty' : ''}"`;
}

// prisma2go lists @@unique groups from both uniqueIndexes and uniqueFields, so a group shows up
// twice. Kept as is: the comment is part of the output existing users diff against.
function indexComments(m: DMMF.Model): string[] {
  const lines = (m.uniqueIndexes ?? []).map((index) => `// Index: ${index.name ?? 'unique'} (${index.fields.join(', ')})`);
  for (const fields of m.uniqueFields ?? []) {
    if (fields.length > 0) lines.push(`// Index: unique (${fields.join(', ')})`);
  }
  return lines;
}

export function renderModel(m: DMMF.Model, cfg: Config): Decl {
  const name = toPascalCase(m.name, cfg.initialisms);
  const table = m.dbName ?? m.name;
  const imports: string[] = [];
  const columns: string[] = [];
  const relations: string[] = [];
  const taken = new Map<string, string>();

  for (const field of m.fields) {
    const isRelation = field.kind === 'object';
    if (isRelation && !cfg.relations) continue;

    const goName = toPascalCase(field.name, cfg.initialisms);
    const clash = taken.get(goName);
    if (clash !== undefined) {
      throw new Error(`prisma-go-generator: ${m.name}: fields "${clash}" and "${field.name}" both become ${goName} in Go`);
    }
    taken.set(goName, field.name);

    const type = fieldType(field, cfg);
    imports.push(...type.imports);
    const tags = cfg.structTags.map((tag) => structTag(tag, field, goName, cfg));
    const line = `\t${goName} ${type.expr}${tags.length > 0 ? ` \`${tags.join(' ')}\`` : ''}`;

    if (isRelation) {
      relations.push(line);
      continue;
    }
    if (field.documentation) columns.push(`\t// ${field.documentation.replaceAll('\n', '\n\t// ')}`);
    columns.push(field.isId ? `${line} // primary key` : line);
  }

  const lines = [
    m.documentation ? `// ${name} - ${m.documentation.replaceAll('\n', '\n// ')}` : `// ${name} represents the ${table} table.`,
    ...indexComments(m),
    `type ${name} struct {`,
    ...columns,
  ];
  if (relations.length > 0) lines.push('', '\t// Relations (not persisted, populate manually)', ...relations);
  lines.push('}');
  if (cfg.tableNameMethod) {
    lines.push('', `// TableName returns the name of the table ${name} rows are stored in.`);
    lines.push(`func (${name}) TableName() string { return ${JSON.stringify(table)} }`);
  }
  return { code: lines.join('\n'), imports };
}
