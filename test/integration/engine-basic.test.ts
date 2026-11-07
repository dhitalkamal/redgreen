import { afterEach, describe, expect, it } from 'vitest';
import { makeConfig } from '../../src/check/config';
import { runEngine } from '../../src/check/engine';
import { makeRepo, mergePr, type TempRepo } from './helpers/repo';

const node = JSON.stringify(process.execPath);
const CHECK = `const fs = require('node:fs');
process.exit(fs.readFileSync('src/value.txt', 'utf8').trim() === '2' ? 0 : 1);
`;

let repo: TempRepo;
afterEach(async () => {
  await repo?.cleanup();
});

// base has value 1; the pr applies its edits and is merged the way GitHub builds the merge ref
async function pr(edit: (r: TempRepo) => Promise<void>): Promise<TempRepo> {
  repo = await makeRepo();
  await repo.write('src/value.txt', '1');
  await repo.write('README.md', 'fixture');
  await repo.commit('base');
  await repo.run(['switch', '-q', '-c', 'pr']);
  await edit(repo);
  await repo.commit('pr');
  await mergePr(repo, 'pr');
  return repo;
}

const fix = async (x: TempRepo) => {
  await x.write('src/value.txt', '2');
  await x.write('tests/value.test.cjs', CHECK);
};

describe('runEngine basics in exit-code mode', () => {
  it('finds coarse proof and restores the pr', async () => {
    const r = await pr(fix);
    const result = await runEngine(makeConfig(r.dir, `${node} tests/value.test.cjs`));
    expect(result.verdict).toBe('proof-found');
    expect(result.mode).toBe('exit-code');
    expect(result.flags).toContain('coarse');
    expect(await r.read('src/value.txt')).toBe('2');
  });

  it('says no proof yet when no test files changed', async () => {
    const r = await pr(async (x) => x.write('src/value.txt', '2'));
    const result = await runEngine(makeConfig(r.dir, 'exit 1'));
    expect(result.verdict).toBe('no-proof-yet');
    expect(result.changed).toEqual({ test: 0, dependency: 0, other: 1 });
  });

  it('is inconclusive when too many files changed', async () => {
    const r = await pr(fix);
    const result = await runEngine(makeConfig(r.dir, 'true', { maxChangedFiles: 1 }));
    expect(result).toMatchObject({ verdict: 'inconclusive', reason: 'more than 1 files changed' });
  });

  it('is inconclusive when dependencies change without an install command', async () => {
    const r = await pr(async (x) => {
      await x.write('package.json', '{}');
      await x.write('tests/value.test.cjs', CHECK);
    });
    const result = await runEngine(makeConfig(r.dir, `${node} tests/value.test.cjs`));
    expect(result.verdict).toBe('inconclusive');
    expect(result.reason).toMatch(/no install-command/);
    // nothing ran without the change, so no whole-command comparison happened either
    expect(result.flags).not.toContain('coarse');
  });

  it('stops early when the test command cannot start', async () => {
    const r = await pr(fix);
    const result = await runEngine(makeConfig(r.dir, 'no-such-command-xyz'));
    expect(result).toMatchObject({ verdict: 'inconclusive', reason: 'test command could not start (with the change)' });
    expect(result.timings.withoutSeconds).toBe(0);
  });

  it('explains a missing parent commit', async () => {
    repo = await makeRepo();
    await repo.write('a.txt', 'x');
    await repo.commit('only');
    await expect(runEngine(makeConfig(repo.dir, 'true'))).rejects.toThrow(/fetch-depth: 2/);
  });
});
