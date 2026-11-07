import { git, GitError } from './git';

const FENCE = /```[\s\S]*?```/g;
const URL = /https?:\/\/\S+/g;
const SPAN = /`([^`\n]{2,120})`/g;
const PLAIN_PATH = /(?:^|[\s(])((?:[\w-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,8})(?=[\s),.;:]|$)/gm;
const FILE_EXT =
  /\.(rs|py|js|jsx|ts|tsx|mjs|cjs|go|rb|java|kt|cs|php|c|h|cc|cpp|hpp|swift|md|json|ya?ml|toml|txt|html|css|scss|sh|sql|xml|lock|cfg|ini)$/i;
const MAX_CANDIDATES = 30;
const MAX_MISSING = 5;

export function looksLikeCode(token: string): boolean {
  // {{.Name}} is go or handlebars template syntax, not a name to look up
  if (/\s/.test(token) || token.includes('{{')) return false;
  return /[/_.]/.test(token) || token.endsWith('()') || /[a-z][A-Z]/.test(token);
}

const clean = (token: string) => token.trim().replace(/\(\)$/, '').replace(/^\.\//, '');

export function extractCandidates(title: string, body: string): string[] {
  const text = `${title}\n${body}`.replace(FENCE, ' ').replace(URL, ' ');
  const found: string[] = [];
  const add = (token: string) => {
    const value = clean(token);
    if (value.length > 1 && !found.includes(value) && found.length < MAX_CANDIDATES) found.push(value);
  };
  for (const match of text.matchAll(SPAN)) {
    const token = (match[1] ?? '').trim();
    if (looksLikeCode(token)) add(token);
  }
  // spans first, then bare paths: the unit test pins this order
  const withoutSpans = text.replace(SPAN, ' ');
  for (const match of withoutSpans.matchAll(PLAIN_PATH)) add(match[1] ?? '');
  return found;
}

const isPath = (candidate: string) => candidate.includes('/') || FILE_EXT.test(candidate);

// the definition spells only the last identifier: Value::<T>::deserialize_struct -> deserialize_struct
function lastSegment(candidate: string): string {
  let bare = candidate;
  for (let prev = ''; prev !== bare; ) {
    prev = bare;
    bare = bare.replace(/<[^<>]*>/g, '');
  }
  return bare.split(/::|\./).filter((part) => part.length > 0).pop() ?? candidate;
}

async function grepFinds(cwd: string, word: string): Promise<boolean> {
  try {
    await git(cwd, ['grep', '-q', '-w', '-F', '-e', word]);
    return true;
  } catch (error) {
    // git grep exits 1 when nothing matches; anything else is a real failure
    if (error instanceof GitError && error.code === 1) return false;
    throw error;
  }
}

export async function findMissing(cwd: string, candidates: string[]): Promise<string[]> {
  const files = (await git(cwd, ['ls-files', '-z'])).split('\0').filter((f) => f.length > 0);
  const missing: string[] = [];
  for (const candidate of candidates) {
    if (missing.length >= MAX_MISSING) break;
    let exists: boolean;
    if (isPath(candidate)) {
      const dir = candidate.replace(/\/$/, '');
      exists = files.some((f) => f === dir || f.endsWith(`/${dir}`) || f.startsWith(`${dir}/`));
    } else {
      const last = lastSegment(candidate);
      exists = (await grepFinds(cwd, candidate)) || (last !== candidate && (await grepFinds(cwd, last)));
    }
    if (!exists) missing.push(candidate);
  }
  return missing;
}
