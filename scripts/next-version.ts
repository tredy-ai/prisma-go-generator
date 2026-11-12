// Works out the next release version from the Conventional Commits merged since the last
// vX.Y.Z tag. Run by .github/workflows/release.yml: prints the version, or nothing when no
// commit calls for a release.
import { execFileSync } from 'node:child_process';

export type Bump = 'major' | 'minor' | 'patch';

const PATCH_TYPES = new Set(['fix', 'perf', 'hotfix', 'patch']);
const RANK: Record<Bump, number> = { patch: 1, minor: 2, major: 3 };

// The markers GitHub honours to not start a workflow. A commit carrying one never releases, not
// even when a later commit starts the workflow and the scan reaches back over it.
const SKIP = /\[(?:ci skip|skip ci|no ci|skip actions|actions skip)\]/i;

/** The bump one commit message (subject and body) asks for, or null for none. */
export function bumpFor(message: string): Bump | null {
  if (SKIP.test(message)) return null;
  const header = /^(\w+)(?:\([^)]*\))?(!)?:\s/.exec(message);
  if (!header) return null;
  const type = (header[1] ?? '').toLowerCase();
  if (header[2] === '!' || /^BREAKING[ -]CHANGE:/m.test(message)) return 'major';
  if (type === 'feat') return 'minor';
  return PATCH_TYPES.has(type) ? 'patch' : null;
}

/** The version after `current` once `messages` are released, or null if none of them releases. */
export function nextVersion(current: string, messages: string[]): string | null {
  let bump: Bump | null = null;
  for (const message of messages) {
    const wanted = bumpFor(message);
    if (wanted && (!bump || RANK[wanted] > RANK[bump])) bump = wanted;
  }
  if (!bump) return null;

  const [major = 0, minor = 0, patch = 0] = current.split('.').map(Number);
  // Before 1.0.0 a breaking change moves the minor version; going to 1.0.0 is a decision, not a side effect.
  if (bump === 'major' && major === 0) bump = 'minor';
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

if (import.meta.main) {
  let lastTag = '';
  try {
    lastTag = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*');
  } catch {
    // no release yet
  }
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const messages = git('log', '--format=%B%x00', range).split('\0').map((m) => m.trim());
  const next = nextVersion(lastTag.replace(/^v/, '') || '0.0.0', messages);
  if (next) console.log(next);
}
