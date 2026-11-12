import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { modelsImportPath } from '../src/generator.js';

describe('modelsImportPath', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'pgg-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const dir = (...parts: string[]): string => {
    const path = join(root, ...parts);
    mkdirSync(path, { recursive: true });
    return path;
  };
  const goMod = (at: string, module: string): void => writeFileSync(join(at, 'go.mod'), `// a comment\nmodule ${module}\n\ngo 1.27\n`);

  it('is goModule when generateGoMod is about to write the go.mod', () => {
    expect(modelsImportPath({ dir: dir('gen'), generateGoMod: true, goModule: 'example.com/gen' })).toBe('example.com/gen');
  });

  it('follows a go.mod that already is in the output directory, which generateGoMod leaves alone', () => {
    const out = dir('gen');
    goMod(out, 'example.com/renamed');
    expect(modelsImportPath({ dir: out, generateGoMod: true, goModule: 'example.com/gen' })).toBe('example.com/renamed');
    expect(modelsImportPath({ dir: out, generateGoMod: false, goModule: '' })).toBe('example.com/renamed');
  });

  it('joins the nearest go.mod above with the path down to the output directory', () => {
    goMod(root, 'example.com/app/v4');
    expect(modelsImportPath({ dir: dir('internal', 'gomodels'), generateGoMod: false, goModule: '' })).toBe('example.com/app/v4/internal/gomodels');
    // The nearest one wins, and it wins over goModule.
    goMod(dir('internal'), '"example.com/internal"');
    expect(modelsImportPath({ dir: dir('internal', 'gomodels'), generateGoMod: false, goModule: 'example.com/ignored' })).toBe(
      'example.com/internal/gomodels',
    );
  });

  it('takes goModule as the import path when there is no go.mod anywhere, and fails without it', () => {
    const out = dir('gen', 'models');
    expect(modelsImportPath({ dir: out, generateGoMod: false, goModule: 'example.com/gen/models' })).toBe('example.com/gen/models');
    expect(() => modelsImportPath({ dir: out, generateGoMod: false, goModule: '' })).toThrow(
      /inputsOutDir needs the import path of the models package, and there is no go.mod in .* or above it/,
    );
  });

  it('refuses a go.mod without a module line', () => {
    writeFileSync(join(root, 'go.mod'), 'go 1.27\n');
    expect(() => modelsImportPath({ dir: dir('gen'), generateGoMod: false, goModule: '' })).toThrow(/has no module line/);
  });
});
