import type { DMMF } from '@prisma/generator-helper';
import type { Config } from './config.js';
import { toPascalCase } from './naming.js';

/** A Go type expression and the import paths it needs. */
export interface GoType {
  expr: string;
  imports: string[];
}

// Go types are written the way the `types` option takes them: a builtin as is, anything else as
// `<import path>.<Name>`.
const SCALARS: Record<string, string> = {
  String: 'string',
  Int: 'int32',
  BigInt: 'int64',
  Float: 'float64',
  Boolean: 'bool',
  DateTime: 'time.Time',
  Json: 'encoding/json.RawMessage',
  Bytes: '[]byte',
  Decimal: 'string',
};

const NATIVE_TYPES: Record<string, string> = {
  Uuid: 'github.com/google/uuid.UUID',
  JsonB: 'encoding/json.RawMessage',
  Json: 'encoding/json.RawMessage',
  Text: 'string',
  VarChar: 'string',
  Char: 'string',
  Citext: 'string',
  SmallInt: 'int32',
  Integer: 'int32',
  Int2: 'int32',
  Int4: 'int32',
  BigInt: 'int64',
  Int8: 'int64',
  Real: 'float32',
  Float4: 'float32',
  DoublePrecision: 'float64',
  Float8: 'float64',
  Decimal: 'string',
  Numeric: 'string',
  Money: 'string',
  Timestamp: 'time.Time',
  Timestamptz: 'time.Time',
  Date: 'time.Time',
  Time: 'time.Time',
  Timetz: 'time.Time',
  ByteA: '[]byte',
};

const FALLBACK = 'encoding/json.RawMessage';

/** The package name Go gives an import path: its last element, ignoring a major-version suffix. */
function packageName(importPath: string): string {
  const parts = importPath.split('/');
  let last = parts.pop() ?? importPath;
  if (/^v\d+$/.test(last) && parts.length > 0) last = parts.pop() ?? last;
  return last.replace(/\.v\d+$/, '');
}

/**
 * Parses a type spec: `string`, `[]byte` and `map[string]any` are used as written, while
 * `github.com/google/uuid.UUID` becomes `uuid.UUID` plus an import. A qualified type may be
 * prefixed with `*` or `[]`.
 */
export function parseGoType(spec: string): GoType {
  const match = /^((?:\[\]|\*)*)([\w./~-]+)\.([A-Za-z_]\w*)$/.exec(spec);
  if (!match) return { expr: spec, imports: [] };
  const [, prefix = '', importPath = '', name = ''] = match;
  return { expr: `${prefix}${packageName(importPath)}.${name}`, imports: [importPath] };
}

/** The Go type of a field before optional, list and relation wrapping. */
export function baseType(field: DMMF.Field, cfg: Config): GoType {
  if (field.kind === 'object' || field.kind === 'enum') {
    return { expr: toPascalCase(field.type, cfg.initialisms), imports: [] };
  }
  const native = field.nativeType?.[0];
  const spec =
    (native ? cfg.types[`db.${native}`] : undefined) ??
    cfg.types[field.type] ??
    (native ? NATIVE_TYPES[native] : undefined) ??
    SCALARS[field.type] ??
    FALLBACK;
  return parseGoType(spec);
}

/** The Go type of a model struct field. */
export function fieldType(field: DMMF.Field, cfg: Config): GoType {
  const base = baseType(field, cfg);
  if (field.isList) return { expr: `[]${base.expr}`, imports: base.imports };
  if (field.kind === 'object') return { expr: `*${base.expr}`, imports: base.imports };
  if (field.isRequired) return base;
  if (cfg.optionalType === 'pointer') return { expr: `*${base.expr}`, imports: base.imports };
  const wrapper = parseGoType(cfg.optionalType);
  return { expr: `${wrapper.expr}[${base.expr}]`, imports: [...base.imports, ...wrapper.imports] };
}
