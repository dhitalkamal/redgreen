import { makeMatcher } from '../check/patterns';

export const DEFAULT_TRUST_PATTERNS = [
  '.github/workflows/**', '.github/actions/**', 'jest.config.*', 'vitest.config.*', 'vitest.workspace.*',
  'vite.config.*', 'karma.conf.*', 'playwright.config.*', 'cypress.config.*', 'pytest.ini', 'tox.ini',
  'noxfile.py', 'setup.cfg', 'Makefile', 'justfile',
];

export function untrustedFiles(changed: string[], patterns: string[]): string[] {
  const isMatch = makeMatcher(patterns);
  return changed.filter((path) => isMatch(path));
}

// the scripts section decides what a test command like `npm test` runs
export function scriptsChanged(basePkg: string | undefined, headPkg: string | undefined): boolean {
  const scripts = (text: string | undefined) => {
    if (text === undefined) return 'absent';
    try {
      return JSON.stringify((JSON.parse(text) as { scripts?: unknown }).scripts ?? null);
    } catch {
      return 'unparseable';
    }
  };
  return scripts(basePkg) !== scripts(headPkg);
}
