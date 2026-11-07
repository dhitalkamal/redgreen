import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { classify } from '../../src/check/classify';
import { parseRawDiff } from '../../src/check/diff';
import { DEFAULT_DEPENDENCY_PATTERNS, DEFAULT_TEST_PATTERNS } from '../../src/check/patterns';
import { planSwap, runOps, trackedSnapshot, verifyRestored } from '../../src/check/swap';
import { makeRepo, mergePr, type TempRepo } from './helpers/repo';

let repo: TempRepo;
afterEach(async () => {
  await repo?.cleanup();
});

async function setup() {
  repo = await makeRepo();
  await repo.write('src/a.js', 'a0');
  await repo.write('src/old.js', 'o0');
  await repo.write('src/gone.js', 'g0');
  await repo.write('tests/a.test.js', 't0');
  await repo.commit('base');
  await repo.run(['switch', '-q', '-c', 'pr']);
  await repo.write('src/a.js', 'a1');
  await repo.run(['mv', 'src/old.js', 'src/new.js']);
  await repo.write('src/added.js', 'n1');
  await repo.remove('src/gone.js');
  await repo.write('tests/a.test.js', 't1');
  await repo.commit('pr');
  await mergePr(repo, 'pr');
  const head = (await repo.run(['rev-parse', 'HEAD'])).trim();
  const base = (await repo.run(['rev-parse', 'HEAD^1'])).trim();
  const changes = parseRawDiff(await repo.run(['diff', '--raw', '-z', '-M', base, head]));
  const { files } = classify(changes, {
    testPatterns: DEFAULT_TEST_PATTERNS,
    dependencyPatterns: DEFAULT_DEPENDENCY_PATTERNS,
  });
  return { refs: { base, head }, plan: planSwap(files) };
}

const exists = (path: string) => existsSync(join(repo.dir, path));

describe('swap against a real repo', () => {
  it('puts non-test files back to base and keeps the PR tests', async () => {
    const { refs, plan } = await setup();
    await runOps(repo.dir, refs, plan.apply);
    expect(await repo.read('src/a.js')).toBe('a0');
    expect(await repo.read('src/old.js')).toBe('o0');
    expect(await repo.read('src/gone.js')).toBe('g0');
    expect(exists('src/new.js')).toBe(false);
    expect(exists('src/added.js')).toBe(false);
    expect(await repo.read('tests/a.test.js')).toBe('t1');
  });

  it('restores the PR exactly and verifies it', async () => {
    const { refs, plan } = await setup();
    const snapshot = await trackedSnapshot(repo.dir);
    await runOps(repo.dir, refs, plan.apply);
    await runOps(repo.dir, refs, plan.undo);
    expect(await repo.read('src/a.js')).toBe('a1');
    expect(await repo.read('src/new.js')).toBe('o0');
    expect(exists('src/old.js')).toBe(false);
    expect(await verifyRestored(repo.dir, plan, snapshot)).toBeNull();
  });

  it('reports a path that should be gone after restore', async () => {
    const { refs, plan } = await setup();
    const snapshot = await trackedSnapshot(repo.dir);
    await runOps(repo.dir, refs, plan.apply);
    await runOps(repo.dir, refs, plan.undo);
    await repo.write('src/gone.js', 'leftover');
    expect(await verifyRestored(repo.dir, plan, snapshot)).toMatch(/src\/gone\.js should not exist/);
  });

  it('reports a tracked file that changed', async () => {
    const { plan } = await setup();
    const snapshot = await trackedSnapshot(repo.dir);
    await repo.write('src/a.js', 'tampered');
    expect(await verifyRestored(repo.dir, plan, snapshot)).toMatch(/tracked files differ/);
  });
});
