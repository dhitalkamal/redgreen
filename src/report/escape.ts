// zero-width and bidirectional controls can make text look like something else
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const CONTROL = /[\u0000-\u001F\u007F]/g;

export function inlineCode(text: string, max = 200): string {
  const clean = text.replace(INVISIBLE, '').replace(CONTROL, ' ').slice(0, max);
  const longest = Math.max(0, ...[...clean.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad = clean.startsWith('`') || clean.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${clean}${pad}${fence}`;
}
