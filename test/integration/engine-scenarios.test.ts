import { afterEach, describe, expect, it } from 'vitest';
import { runEngine } from '../../src/check/engine';
import type { TempRepo } from './helpers/repo';
import { PASSES_ANYWAY, fixValue, miniConfig, scenario } from './helpers/scenario';

let repo: TempRepo | undefined;
afterEach(async () => {
  await repo?.cleanup();
  repo = undefined;
});

const ONE_TEST =
  "const { value } = require('../src/value.cjs');\n" +
  "exports['returns one'] = () => { if (value() !== 1) throw new Error('expected 1'); };\n";
const EXTRA_TEST =
  "const { extra } = require('../src/extra.cjs');\n" +
  "exports['extra works'] = () => { if (extra() !== 'x') throw new Error('bad'); };\n";
const DATA_TEST =
  "const fs = require('node:fs');\nconst path = require('node:path');\n" +
  "exports['reads case'] = () => { JSON.parse(fs.readFileSync(path.join(__dirname, '../data/case.json'), 'utf8')); };\n";

describe('engine scenarios with per-test results', () => {
  it('finds proof for a real fix and restores the pr', async () => {
    repo = await scenario(fixValue);
    const result = await runEngine(miniConfig(repo));
    expect(result).toMatchObject({ verdict: 'proof-found', mode: 'junit' });
    expect(result.proof).toEqual([
      { id: 'tests/value.test.cjs::returns two', file: undefined, message: 'AssertionError: expected 2, got 1', kind: 'assertion', suspect: false },
    ]);
    expect(result.counts.independent).toBe(1);
    expect(await repo.read('src/value.cjs')).toContain('2');
  });

  it('says no proof when the new test passes without the change', async () => {
    repo = await scenario(async (r) => {
      await r.write('src/value.cjs', 'exports.value = () => 2;\n');
      await r.write('tests/always.test.cjs', PASSES_ANYWAY);
    });
    expect((await runEngine(miniConfig(repo))).verdict).toBe('no-proof');
  });

  it('reports tests the change breaks ahead of proof', async () => {
    repo = await scenario(fixValue, async (r) => r.write('tests/one.test.cjs', ONE_TEST));
    const result = await runEngine(miniConfig(repo));
    expect(result.verdict).toBe('breaks-tests');
    expect(result.broken.map((b) => b.id)).toEqual(['tests/one.test.cjs::returns one']);
    expect(result.proof).toHaveLength(1);
  });

  it('ignores tests that were already failing', async () => {
    repo = await scenario(fixValue, async (r) =>
      r.write('tests/red.test.cjs', "exports['always red'] = () => { throw new Error('red'); };\n"),
    );
    const result = await runEngine(miniConfig(repo));
    expect(result.verdict).toBe('proof-found');
    expect(result.counts.alreadyFailing).toBe(1);
  });

  it('counts a test file that cannot load without the change as missing-code proof', async () => {
    repo = await scenario(async (r) => {
      await r.write('src/extra.cjs', "exports.extra = () => 'x';\n");
      await r.write('tests/extra.test.cjs', EXTRA_TEST);
    });
    const result = await runEngine(miniConfig(repo));
    expect(result.verdict).toBe('proof-found');
    expect(result.proof[0]).toMatchObject({ id: 'tests/extra.test.cjs::extra works', kind: 'missing-code' });
    expect(result.proof[0]?.message).toMatch(/Cannot find module/);
  });

  it('flags proof that only fails because a data file was removed', async () => {
    repo = await scenario(async (r) => {
      await r.write('data/case.json', '{"n":2}');
      await r.write('tests/data.test.cjs', DATA_TEST);
    });
    const result = await runEngine(miniConfig(repo));
    expect(result.verdict).toBe('proof-found');
    expect(result.proof[0]?.suspect).toBe(true);
    expect(result.flags).toContain('suspect-support-file');
  });
});
