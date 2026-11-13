import { afterEach, describe, expect, it } from 'vitest';
import { runEngine } from '../../src/check/engine';
import type { TempRepo } from './helpers/repo';
import { NODE, PASSES_ANYWAY, fixValue, miniConfig, scenario } from './helpers/scenario';

let repo: TempRepo | undefined;
afterEach(async () => {
  await repo?.cleanup();
  repo = undefined;
});

// passes on even runs and fails on odd runs, counted in an untracked file
const FLIP_TEST = `const fs = require('node:fs');
exports['flips'] = () => {
  fs.mkdirSync('.tmp', { recursive: true });
  const n = fs.existsSync('.tmp/count') ? Number(fs.readFileSync('.tmp/count', 'utf8')) : 0;
  fs.writeFileSync('.tmp/count', String(n + 1));
  if (n % 2 === 1) throw new Error('flipped');
};
`;

describe('engine edge scenarios', () => {
  it('reinstalls dependencies around the without run', async () => {
    repo = await scenario(async (r) => {
      await fixValue(r);
      await r.write('package.json', '{"name":"fixture"}');
    });
    const result = await runEngine(miniConfig(repo, { installCommand: `${NODE} -e "0"` }));
    expect(result.verdict).toBe('proof-found');
  });

  it('leaves flaky tests out of the proof', async () => {
    repo = await scenario(fixValue, async (r) => r.write('tests/flip.test.cjs', FLIP_TEST));
    const result = await runEngine(miniConfig(repo, { retries: 1 }));
    expect(result.verdict).toBe('proof-found');
    expect(result.counts.flaky).toBe(1);
    expect(result.flags).toContain('retries-used');
  });

  it('is inconclusive when the tests time out', async () => {
    repo = await scenario(fixValue);
    const cfg = miniConfig(repo, {
      testCommand: `${NODE} -e "setTimeout(() => {}, 60000)"`,
      runTimeoutMinutes: 0.01,
    });
    const result = await runEngine(cfg);
    expect(result.verdict).toBe('inconclusive');
    expect(result.reason).toMatch(/took longer than/);
  });

  it('is inconclusive when a new test lives outside the test patterns', async () => {
    repo = await scenario(async (r) => {
      await r.write('src/lib.check.cjs', "exports['inline'] = () => {};\n");
      await r.write('tests/always.test.cjs', PASSES_ANYWAY);
    });
    const result = await runEngine(miniConfig(repo));
    expect(result.verdict).toBe('inconclusive');
    expect(result.reason).toMatch(/could not be compared/);
  });

  it('restores the pr when the install fails without the change', async () => {
    repo = await scenario(async (r) => {
      await fixValue(r);
      await r.write('package.json', '{"name":"fixture"}');
      await r.write('tools/install.cjs', 'process.exit(0);\n');
    });
    const result = await runEngine(miniConfig(repo, { installCommand: `${NODE} tools/install.cjs` }));
    expect(result.verdict).toBe('inconclusive');
    expect(result.reason).toMatch(/install command exited with code 1/);
    expect(result.flags).not.toContain('coarse');
    expect(await repo.read('src/value.cjs')).toContain('2');
    expect(await repo.read('tools/install.cjs')).toContain('exit(0)');
  });

  it('falls back to exit codes when nothing can run without the change', async () => {
    repo = await scenario(async (r) => {
      await fixValue(r);
      await r.write('src/build.cjs', '// build step\n');
    });
    const cfg = miniConfig(repo, { testCommand: `${NODE} src/build.cjs && ${NODE} minirunner.cjs` });
    const result = await runEngine(cfg);
    expect(result).toMatchObject({ verdict: 'proof-found', mode: 'exit-code' });
    expect(result.flags).toEqual(expect.arrayContaining(['no-results-without-change', 'coarse']));
  });
});
