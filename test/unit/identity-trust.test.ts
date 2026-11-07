import { describe, expect, it } from 'vitest';
import { verifyIdentity, type PullInfo, type RunInfo } from '../../src/report/identity';
import { DEFAULT_TRUST_PATTERNS, scriptsChanged, untrustedFiles } from '../../src/report/trust';
import type { Results } from '../../src/shared/schema';

const H = 'a'.repeat(40);
const run: RunInfo = { path: '.github/workflows/redgreen.yml', event: 'pull_request', headSha: H, headRepo: 'fork/repo' };
const results = { pr: 3, headSha: H } as Results;
const pulls = (p?: PullInfo) => async () => p;
const good: PullInfo = { number: 3, headSha: H, headRepo: 'fork/repo' };
const PATH = '.github/workflows/redgreen.yml';

describe('verifyIdentity', () => {
  it('accepts matching results', async () => {
    expect(await verifyIdentity(run, results, PATH, pulls(good))).toBeNull();
  });

  it('rejects each kind of mismatch', async () => {
    expect(await verifyIdentity({ ...run, path: '.github/workflows/evil.yml' }, results, PATH, pulls(good))).toMatch(/expected/);
    expect(await verifyIdentity({ ...run, event: 'push' }, results, PATH, pulls(good))).toMatch(/push event/);
    expect(await verifyIdentity(run, { ...results, headSha: 'b'.repeat(40) }, PATH, pulls(good))).toMatch(/different commit/);
    expect(await verifyIdentity(run, results, PATH, pulls(undefined))).toMatch(/not found/);
    expect(await verifyIdentity(run, results, PATH, pulls({ ...good, headRepo: 'other/repo' }))).toMatch(/does not match/);
  });

  // a deleted fork leaves head.repo null on both sides; '' === '' must not count as a match
  it('fails closed when the head repository is unknown', async () => {
    const gone = { ...good, headRepo: '' };
    expect(await verifyIdentity({ ...run, headRepo: '' }, results, PATH, pulls(gone))).toMatch(/head repository/);
    expect(await verifyIdentity(run, results, PATH, pulls(gone))).toMatch(/head repository/);
  });
});

describe('trust', () => {
  it('finds files that control how tests run', () => {
    const changed = ['.github/workflows/redgreen.yml', 'pkg/Makefile', 'vitest.config.ts', 'src/a.ts', 'tests/a.test.ts'];
    expect(untrustedFiles(changed, DEFAULT_TRUST_PATTERNS)).toEqual(['.github/workflows/redgreen.yml', 'pkg/Makefile', 'vitest.config.ts']);
  });

  // gnu make reads GNUmakefile and makefile before Makefile; pytest loads conftest.py hooks on its own
  it('finds make and pytest files that can override how tests run', () => {
    const changed = ['GNUmakefile', 'sub/makefile', 'tests/conftest.py', 'src/conftest_helper.py'];
    expect(untrustedFiles(changed, DEFAULT_TRUST_PATTERNS)).toEqual(['GNUmakefile', 'sub/makefile', 'tests/conftest.py']);
  });

  it('compares only the scripts section of package.json', () => {
    const pkg = (scripts: object, deps: object = {}) => JSON.stringify({ scripts, dependencies: deps });
    expect(scriptsChanged(pkg({ test: 'vitest' }), pkg({ test: 'vitest' }, { zod: '4' }))).toBe(false);
    expect(scriptsChanged(pkg({ test: 'vitest' }), pkg({ test: 'exit 0' }))).toBe(true);
    expect(scriptsChanged(undefined, pkg({ test: 'vitest' }))).toBe(true);
    expect(scriptsChanged(undefined, undefined)).toBe(false);
    expect(scriptsChanged(pkg({ test: 'vitest' }), '{broken')).toBe(true);
  });
});
