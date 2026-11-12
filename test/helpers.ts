import { readFileSync } from 'node:fs';
import type { DMMF } from '@prisma/generator-helper';
import { parseConfig, type Config } from '../src/config.js';

export function config(overrides: Record<string, string | string[]> = {}, output = '/out/models'): Config {
  return parseConfig({ output: { value: output }, config: overrides });
}

export function field(overrides: Partial<DMMF.Field>): DMMF.Field {
  return {
    name: 'value',
    kind: 'scalar',
    type: 'String',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    hasDefaultValue: false,
    ...overrides,
  } as DMMF.Field;
}

/** DMMF fixtures carried over from prisma2go's testdata. */
export function fixture(name: 'basic' | 'complex'): DMMF.Datamodel {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as DMMF.Datamodel;
}
