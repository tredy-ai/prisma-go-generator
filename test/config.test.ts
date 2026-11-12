import { describe, expect, it } from 'vitest';
import { config } from './helpers.js';

describe('parseConfig', () => {
  it('defaults to prisma2go behaviour', () => {
    const cfg = config();
    expect(cfg).toMatchObject({
      dir: '/out/models',
      layout: 'single',
      fileName: 'models.go',
      package: 'models',
      structTags: [
        { key: 'json', naming: 'field' },
        { key: 'db', naming: 'column' },
      ],
      types: {},
      optionalType: 'pointer',
      enumType: 'int',
      enumDirective: 'enumer -type={name} -json -sql -text -trimprefix={name}',
      enumer: true,
      enumerArgs: ['-json', '-sql', '-text', '-trimprefix={name}'],
      runGoGenerate: false,
      relations: true,
      tableNameMethod: false,
      gofmt: true,
      inputs: [],
      generateGoMod: false,
    });
    expect([...cfg.omitempty]).toEqual(['json']);
    expect(cfg.initialisms.size).toBe(0);
  });

  it('takes the package name from the output directory', () => {
    expect(config({}, '/repo/gomodels').package).toBe('gomodels');
    expect(config({ package: 'prisma' }, '/repo/gomodels').package).toBe('prisma');
  });

  it('asks for a package name when the directory is not a Go identifier', () => {
    expect(() => config({}, '/repo/go-models')).toThrow(/package/);
  });

  it('rejects unknown options so typos are not silently ignored', () => {
    expect(() => config({ structTag: 'json' })).toThrow(/unknown option "structTag"/);
  });

  it('rejects non-boolean values for boolean options', () => {
    expect(() => config({ relations: 'yes' })).toThrow(/relations must be "true" or "false"/);
  });

  it('parses struct tags with an optional naming', () => {
    expect(config({ structTags: ['json:camel', 'db', 'yaml:snake', 'bson:column'] }).structTags).toEqual([
      { key: 'json', naming: 'camel' },
      { key: 'db', naming: 'column' },
      { key: 'yaml', naming: 'snake' },
      { key: 'bson', naming: 'column' },
    ]);
    expect(() => config({ structTags: ['json:kebab'] })).toThrow(/naming/);
  });

  it('accepts a single string where a list is expected', () => {
    expect(config({ structTags: 'json' }).structTags).toEqual([{ key: 'json', naming: 'field' }]);
  });

  it('accepts an empty list to turn struct tags off', () => {
    expect(config({ structTags: [] }).structTags).toEqual([]);
  });

  it('parses type overrides', () => {
    expect(config({ types: ['Int=int', 'db.Uuid=string'] }).types).toEqual({ Int: 'int', 'db.Uuid': 'string' });
    expect(() => config({ types: ['Int'] })).toThrow(/Prisma=Go/);
    expect(() => config({ types: ['Integer=int'] })).toThrow(/Integer/);
  });

  it('no enumer directive by default for string enums', () => {
    expect(config({ enumType: 'string' }).enumDirective).toBe('');
    expect(config({ enumType: 'string', enumDirective: 'stringer -type={name}' }).enumDirective).toBe('stringer -type={name}');
    expect(() => config({ enumType: 'float64' })).toThrow(/enumType/);
  });

  it('accepts any Go integer type for enums and keeps enumer on for them', () => {
    for (const enumType of ['int8', 'uint', 'uint8', 'int64']) {
      expect(config({ enumType })).toMatchObject({ enumType, enumer: true });
    }
  });

  it('picks the layout from the emit flags and refuses two at once', () => {
    expect(config({ emitPerFile: 'true' }).layout).toBe('perFile');
    expect(config({ emitPerModel: 'true' }).layout).toBe('perModel');
    expect(config({ emitSingle: 'true' }).layout).toBe('single');
    expect(() => config({ emitPerFile: 'true', emitPerModel: 'true' })).toThrow(/emitPerFile and emitPerModel are mutually exclusive/);
  });

  it('derives the default go:generate directive from enumerArgs', () => {
    expect(config({ enumerArgs: ['-json', '-transform=upper'] }).enumDirective).toBe('enumer -type={name} -json -transform=upper');
  });

  it('turns enumer off for string enums and refuses the combination', () => {
    expect(config({ enumType: 'string' }).enumer).toBe(false);
    expect(() => config({ enumType: 'string', enumer: 'true' })).toThrow(/enumer/);
  });

  it('upper-cases initialisms', () => {
    expect([...config({ initialisms: ['id', 'Url'] }).initialisms]).toEqual(['ID', 'URL']);
  });

  it('expands inputs = "all" and rejects unknown families', () => {
    expect(config({ inputs: 'all' }).inputs).toEqual(['where', 'whereUnique', 'orderBy', 'create', 'update', 'select', 'include']);
    expect(config({ inputs: ['where', 'create'] }).inputs).toEqual(['where', 'create']);
    expect(() => config({ inputs: ['upsert'] })).toThrow(/upsert/);
  });

  it('needs a module path to generate go.mod', () => {
    expect(() => config({ generateGoMod: 'true' })).toThrow(/goModule/);
    expect(config({ generateGoMod: 'true', goModule: 'example.com/m', goVersion: '1.24' })).toMatchObject({
      generateGoMod: true,
      goModule: 'example.com/m',
      goVersion: '1.24',
    });
  });
});
