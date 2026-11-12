import { basename } from 'node:path';

export const NAMINGS = ['field', 'column', 'snake', 'camel', 'pascal'] as const;
export type Naming = (typeof NAMINGS)[number];

export const INPUT_FAMILIES = ['where', 'whereUnique', 'orderBy', 'create', 'update', 'select', 'include'] as const;
export type InputFamily = (typeof INPUT_FAMILIES)[number];

export const PRISMA_SCALARS = ['String', 'Int', 'BigInt', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'Decimal'] as const;

export interface StructTag {
  key: string;
  naming: Naming;
}

export interface Config {
  /** Absolute output directory (the generator block's `output`). */
  dir: string;
  /** One file for everything, one per .prisma file, or one per model. */
  layout: 'single' | 'perFile' | 'perModel';
  /** The single layout's file, and the fallback for declarations whose .prisma file is unknown. */
  fileName: string;
  package: string;
  structTags: StructTag[];
  /** Tag keys that get `,omitempty` on optional and defaulted columns. */
  omitempty: ReadonlySet<string>;
  /** Go type overrides keyed by Prisma scalar (`Int`) or native type (`db.Uuid`). */
  types: Record<string, string>;
  /** `pointer`, or a generic wrapper type such as `database/sql.Null`. */
  optionalType: string;
  /** The Go type behind every enum: an integer type (iota constants) or `string`. */
  enumType: string;
  /** The value of an integer enum's first constant; the following ones count up from it. */
  enumStart: number;
  /** `//go:generate` command per enum, `{name}` being the Go enum type; empty for none. */
  enumDirective: string;
  /** Run enumer for every enum after writing the files. */
  enumer: boolean;
  /** Arguments after `enumer -type={name}`, used for the run and the default directive. */
  enumerArgs: string[];
  /** Run `go generate` in the output directory after everything else. */
  runGoGenerate: boolean;
  initialisms: ReadonlySet<string>;
  relations: boolean;
  tableNameMethod: boolean;
  gofmt: boolean;
  inputs: InputFamily[];
  generateGoMod: boolean;
  goModule: string;
  /** Empty means "ask the installed Go toolchain". */
  goVersion: string;
}

/** The parts of Prisma's GeneratorConfig this generator reads. */
export interface GeneratorBlock {
  output: { value: string | null } | null;
  config: Record<string, string | string[] | undefined>;
}

const DEFAULT_ENUMER_ARGS = ['-json', '-sql', '-text', '-trimprefix={name}'];
const INTEGER_TYPES = ['int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64'];
const LAYOUT_FLAGS = { emitSingle: 'single', emitPerFile: 'perFile', emitPerModel: 'perModel' } as const;

const OPTIONS = [
  'emitSingle',
  'emitPerFile',
  'emitPerModel',
  'fileName',
  'package',
  'structTags',
  'omitempty',
  'types',
  'optionalType',
  'enumType',
  'enumStart',
  'enumDirective',
  'enumer',
  'enumerArgs',
  'runGoGenerate',
  'initialisms',
  'relations',
  'tableNameMethod',
  'gofmt',
  'inputs',
  'generateGoMod',
  'goModule',
  'goVersion',
];

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function fail(message: string): Error {
  return new Error(`prisma-go-generator: ${message}`);
}

export function parseConfig(generator: GeneratorBlock): Config {
  const raw = generator.config;
  for (const key of Object.keys(raw)) {
    if (!OPTIONS.includes(key)) throw fail(`unknown option "${key}". Known options: output, ${OPTIONS.join(', ')}`);
  }

  const str = (key: string, fallback: string): string => {
    const value = raw[key];
    if (value === undefined) return fallback;
    if (Array.isArray(value)) throw fail(`${key} must be a single string`);
    return value;
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const value = str(key, String(fallback));
    if (value !== 'true' && value !== 'false') throw fail(`${key} must be "true" or "false", got "${value}"`);
    return value === 'true';
  };
  const list = (key: string, fallback: string[]): string[] => {
    const value = raw[key];
    if (value === undefined) return fallback;
    return Array.isArray(value) ? value : [value];
  };
  const goFile = (key: string, fallback: string): string => {
    const value = str(key, fallback);
    if (!/^[^/\\]+\.go$/.test(value)) throw fail(`${key} must be a .go file name without a directory, got "${value}"`);
    return value;
  };

  const dir = generator.output?.value;
  if (!dir) throw fail('no output directory');

  const pkg = str('package', basename(dir));
  if (!IDENT.test(pkg)) {
    throw fail(`"${pkg}" is not a valid Go package name; set package = "..." in the generator block`);
  }

  const structTags = list('structTags', ['json', 'db']).map((entry): StructTag => {
    const [key = '', naming = key === 'db' ? 'column' : 'field', ...rest] = entry.split(':');
    if (!IDENT.test(key) || rest.length > 0) throw fail(`structTags entry "${entry}" must look like "json" or "json:snake"`);
    if (!(NAMINGS as readonly string[]).includes(naming)) {
      throw fail(`structTags entry "${entry}": naming must be one of ${NAMINGS.join(', ')}`);
    }
    return { key, naming: naming as Naming };
  });

  const types: Record<string, string> = {};
  for (const entry of list('types', [])) {
    const eq = entry.indexOf('=');
    const key = entry.slice(0, eq);
    const goType = entry.slice(eq + 1);
    if (eq < 1 || goType === '') throw fail(`types entry "${entry}" must look like Prisma=Go, for example "Int=int" or "db.Uuid=string"`);
    if (!(PRISMA_SCALARS as readonly string[]).includes(key) && !/^db\.\w+$/.test(key)) {
      throw fail(`types entry "${entry}": "${key}" is neither a Prisma scalar (${PRISMA_SCALARS.join(', ')}) nor a native type such as db.Uuid`);
    }
    types[key] = goType;
  }

  const enumType = str('enumType', 'int');
  const integerEnums = INTEGER_TYPES.includes(enumType);
  if (!integerEnums && enumType !== 'string') throw fail(`enumType must be "string" or one of ${INTEGER_TYPES.join(', ')}, got "${enumType}"`);
  const enumStartValue = str('enumStart', '0');
  if (!/^\d+$/.test(enumStartValue)) throw fail(`enumStart must be a non-negative integer, got "${enumStartValue}"`);
  const enumStart = Number(enumStartValue);
  if (enumStart > 0 && !integerEnums) throw fail('enumStart needs an integer enumType: string enums hold the database value, not a number');
  const enumer = bool('enumer', integerEnums);
  if (enumer && !integerEnums) throw fail('enumer = "true" needs an integer enumType: enumer only handles integer enums');
  const enumerArgs = list('enumerArgs', DEFAULT_ENUMER_ARGS);

  const layouts = (Object.keys(LAYOUT_FLAGS) as (keyof typeof LAYOUT_FLAGS)[]).filter((flag) => bool(flag, false));
  if (layouts.length > 1) throw fail(`${layouts.join(' and ')} are mutually exclusive; set only one to "true"`);

  const requested = list('inputs', []);
  const inputs = requested.includes('all') ? [...INPUT_FAMILIES] : requested;
  for (const family of inputs) {
    if (!(INPUT_FAMILIES as readonly string[]).includes(family)) {
      throw fail(`inputs entry "${family}" must be "all" or one of ${INPUT_FAMILIES.join(', ')}`);
    }
  }

  const generateGoMod = bool('generateGoMod', false);
  const goModule = str('goModule', '');
  if (generateGoMod && goModule === '') throw fail('generateGoMod = "true" needs goModule = "<module path>"');

  return {
    dir,
    layout: layouts[0] ? LAYOUT_FLAGS[layouts[0]] : 'single',
    fileName: goFile('fileName', 'models.go'),
    package: pkg,
    structTags,
    omitempty: new Set(list('omitempty', ['json'])),
    types,
    optionalType: str('optionalType', 'pointer'),
    enumType,
    enumStart,
    enumDirective: str('enumDirective', integerEnums ? ['enumer -type={name}', ...enumerArgs].join(' ') : ''),
    enumer,
    enumerArgs,
    runGoGenerate: bool('runGoGenerate', false),
    initialisms: new Set(list('initialisms', []).map((s) => s.toUpperCase())),
    relations: bool('relations', true),
    tableNameMethod: bool('tableNameMethod', false),
    gofmt: bool('gofmt', true),
    inputs: inputs as InputFamily[],
    generateGoMod,
    goModule,
    goVersion: str('goVersion', ''),
  };
}
