import { describe, expect, it } from 'vitest';
import { fieldType, parseGoType } from '../src/types.js';
import { config, field } from './helpers.js';

const defaults = config();

describe('fieldType with the default mapping', () => {
  it.each([
    ['String', 'string', []],
    ['Int', 'int32', []],
    ['BigInt', 'int64', []],
    ['Float', 'float64', []],
    ['Boolean', 'bool', []],
    ['DateTime', 'time.Time', ['time']],
    ['Json', 'json.RawMessage', ['encoding/json']],
    ['Bytes', '[]byte', []],
    ['Decimal', 'string', []],
    ['SomethingNew', 'json.RawMessage', ['encoding/json']],
  ])('%s -> %s', (type, expr, imports) => {
    expect(fieldType(field({ type }), defaults)).toEqual({ expr, imports });
  });

  it.each([
    ['Uuid', 'String', 'uuid.UUID', ['github.com/google/uuid']],
    ['JsonB', 'Json', 'json.RawMessage', ['encoding/json']],
    ['VarChar', 'String', 'string', []],
    ['SmallInt', 'Int', 'int32', []],
    ['Real', 'Float', 'float32', []],
    ['DoublePrecision', 'Float', 'float64', []],
    ['Money', 'Decimal', 'string', []],
    ['Timestamptz', 'DateTime', 'time.Time', ['time']],
    ['ByteA', 'Bytes', '[]byte', []],
    ['Inet', 'String', 'string', []],
  ])('@db.%s on %s -> %s', (native, type, expr, imports) => {
    expect(fieldType(field({ type, nativeType: [native, []] }), defaults)).toEqual({ expr, imports });
  });

  it('wraps optional scalars and enums in a pointer', () => {
    expect(fieldType(field({ isRequired: false }), defaults).expr).toBe('*string');
    expect(fieldType(field({ type: 'Json', isRequired: false }), defaults).expr).toBe('*json.RawMessage');
    expect(fieldType(field({ kind: 'enum', type: 'Role', isRequired: false }), defaults).expr).toBe('*Role');
  });

  it('maps lists to slices', () => {
    expect(fieldType(field({ isList: true }), defaults).expr).toBe('[]string');
  });

  it('maps relations to a pointer or a slice of the model', () => {
    expect(fieldType(field({ kind: 'object', type: 'user_account' }), defaults).expr).toBe('*UserAccount');
    expect(fieldType(field({ kind: 'object', type: 'Post', isList: true }), defaults).expr).toBe('[]Post');
  });
});

describe('type overrides', () => {
  it('replaces a scalar mapping, including under a built-in native mapping', () => {
    const cfg = config({ types: ['Int=int'] });
    expect(fieldType(field({ type: 'Int' }), cfg).expr).toBe('int');
    expect(fieldType(field({ type: 'Int', nativeType: ['Integer', []] }), cfg).expr).toBe('int');
  });

  it('applies a Decimal override to native decimal columns', () => {
    const cfg = config({ types: ['Decimal=github.com/shopspring/decimal.Decimal'] });
    expect(fieldType(field({ type: 'Decimal', nativeType: ['Decimal', ['10', '2']] }), cfg)).toEqual({
      expr: 'decimal.Decimal',
      imports: ['github.com/shopspring/decimal'],
    });
  });

  it('replaces a native mapping', () => {
    expect(fieldType(field({ nativeType: ['Uuid', []] }), config({ types: ['db.Uuid=string'] })).expr).toBe('string');
    expect(fieldType(field({ nativeType: ['Uuid', []] }), config({ types: ['db.Uuid=uuid.UUID'] }))).toEqual({
      expr: 'uuid.UUID',
      imports: ['uuid'],
    });
  });

  it('prefers a native override over a scalar override', () => {
    const cfg = config({ types: ['String=example.com/x.Str', 'db.Citext=example.com/x.CI'] });
    expect(fieldType(field({ nativeType: ['Citext', []] }), cfg).expr).toBe('x.CI');
    expect(fieldType(field({ nativeType: ['Text', []] }), cfg).expr).toBe('x.Str');
  });
});

describe('optionalType', () => {
  it('wraps optional scalars in a generic type instead of a pointer', () => {
    const cfg = config({ optionalType: 'database/sql.Null' });
    expect(fieldType(field({ isRequired: false }), cfg)).toEqual({ expr: 'sql.Null[string]', imports: ['database/sql'] });
    expect(fieldType(field({ type: 'DateTime', isRequired: false }), cfg)).toEqual({
      expr: 'sql.Null[time.Time]',
      imports: ['time', 'database/sql'],
    });
  });

  it('leaves relations as pointers', () => {
    const cfg = config({ optionalType: 'database/sql.Null' });
    expect(fieldType(field({ kind: 'object', type: 'User', isRequired: false }), cfg).expr).toBe('*User');
  });
});

describe('parseGoType', () => {
  it.each([
    ['string', 'string', []],
    ['[]byte', '[]byte', []],
    ['map[string]any', 'map[string]any', []],
    ['time.Time', 'time.Time', ['time']],
    ['encoding/json.RawMessage', 'json.RawMessage', ['encoding/json']],
    ['github.com/gofrs/uuid/v5.UUID', 'uuid.UUID', ['github.com/gofrs/uuid/v5']],
    ['gopkg.in/yaml.v3.Node', 'yaml.Node', ['gopkg.in/yaml.v3']],
    ['*math/big.Int', '*big.Int', ['math/big']],
    ['[]github.com/lib/pq.StringArray', '[]pq.StringArray', ['github.com/lib/pq']],
  ])('%s -> %s', (spec, expr, imports) => {
    expect(parseGoType(spec)).toEqual({ expr, imports });
  });
});
