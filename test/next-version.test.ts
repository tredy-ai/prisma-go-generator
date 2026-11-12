import { describe, expect, it } from 'vitest';
import { bumpFor, nextVersion } from '../scripts/next-version.js';

describe('bumpFor', () => {
  it.each([
    ['fix: handle empty enums', 'patch'],
    ['perf(render): fewer passes', 'patch'],
    ['hotfix: wrong import path', 'patch'],
    ['patch: typo in generated comment', 'patch'],
    ['feat: per-model layout', 'minor'],
    ['feat(inputs): aggregate inputs', 'minor'],
    ['feat!: rename structTags', 'major'],
    ['fix(config)!: reject unknown options', 'major'],
    ['refactor: split render\n\nBREAKING CHANGE: fileName now needs .go', 'major'],
    ['Feat: capitalised type', 'minor'],
  ])('%s -> %s', (message, bump) => {
    expect(bumpFor(message)).toBe(bump);
  });

  it.each(['docs: clarify options', 'chore: bump prisma', 'ci: add release workflow', 'test: more fixtures', 'Merge branch main', 'fix typo'])(
    '%s releases nothing',
    (message) => {
      expect(bumpFor(message)).toBeNull();
    },
  );
});

describe('nextVersion', () => {
  it('takes the largest bump among the commits', () => {
    expect(nextVersion('1.2.3', ['fix: a', 'feat: b', 'docs: c'])).toBe('1.3.0');
    expect(nextVersion('1.2.3', ['fix: a', 'chore: b'])).toBe('1.2.4');
    expect(nextVersion('1.2.3', ['feat: a', 'feat!: b'])).toBe('2.0.0');
  });

  it('returns null when nothing releases', () => {
    expect(nextVersion('1.2.3', ['docs: a', 'chore: b'])).toBeNull();
    expect(nextVersion('1.2.3', [])).toBeNull();
  });

  it('starts at 0.1.0 from the first feature', () => {
    expect(nextVersion('0.0.0', ['feat: first cut'])).toBe('0.1.0');
  });

  it('keeps a breaking change below 1.0.0 to a minor bump', () => {
    expect(nextVersion('0.4.2', ['feat!: rename an option'])).toBe('0.5.0');
    expect(nextVersion('0.4.2', ['fix: a'])).toBe('0.4.3');
  });
});
