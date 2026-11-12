const NO_INITIALISMS: ReadonlySet<string> = new Set();

/**
 * Converts a Prisma identifier to an exported Go identifier, the way prisma2go does: the first
 * letter and any letter after `_`, `-` or a space is upper-cased and everything else is kept, so
 * `user_name` and `userName` both become `UserName` and `USER_NAME` becomes `USERNAME`.
 *
 * Words that match one of the upper-case initialisms are upper-cased whole (`UserId` -> `UserID`).
 */
export function toPascalCase(s: string, initialisms: ReadonlySet<string> = NO_INITIALISMS): string {
  let out = '';
  let upperNext = true;
  for (const ch of s) {
    if (ch === '_' || ch === '-' || ch === ' ') {
      upperNext = true;
      continue;
    }
    out += upperNext ? ch.toUpperCase() : ch;
    upperNext = false;
  }
  if (initialisms.size === 0) return out;
  return out.replace(/[A-Z][a-z0-9]*/g, (word) => (initialisms.has(word.toUpperCase()) ? word.toUpperCase() : word));
}

/** Names an enum constant: `Role` + `SUPER_USER` -> `RoleSuperUser`. */
export function toEnumConstName(enumName: string, value: string, initialisms: ReadonlySet<string> = NO_INITIALISMS): string {
  return enumName + toPascalCase(value.toLowerCase(), initialisms);
}

function words(s: string): string[] {
  return s.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g) ?? [];
}

export function toSnakeCase(s: string): string {
  return words(s)
    .map((w) => w.toLowerCase())
    .join('_');
}

export function toCamelCase(s: string): string {
  return words(s)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}
