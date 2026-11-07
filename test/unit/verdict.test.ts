import { describe, expect, it } from 'vitest';
import type { Comparison, Outcome } from '../../src/check/compare';
import type { RunResult } from '../../src/check/runner';
import { couldNotStart, decideFallback, decideVerdict, runProblem } from '../../src/check/verdict';

function res(partial: Partial<RunResult> = {}): RunResult {
  return { exitCode: 0, timedOut: false, durationMs: 1, outputTail: '', ...partial };
}

function cmp(counts: Partial<Record<Outcome, number>>): Comparison {
  return {
    items: [],
    counts: { proof: 0, independent: 0, 'already-failing': 0, broken: 0, ignored: 0, 'not-comparable': 0, ...counts },
  };
}

describe('couldNotStart', () => {
  it('spots start errors and shell exit codes 126 and 127', () => {
    expect(couldNotStart(res({ startError: 'spawn failed' }))).toBe(true);
    expect(couldNotStart(res({ exitCode: 127 }))).toBe(true);
    expect(couldNotStart(res({ exitCode: 126 }))).toBe(true);
    expect(couldNotStart(res({ exitCode: 1 }))).toBe(false);
  });
});

describe('runProblem', () => {
  it('reports each kind of run problem', () => {
    expect(runProblem({ depsWithoutInstall: true }, 20)).toMatch(/no install-command/);
    expect(runProblem({ depsWithoutInstall: false, swapFailed: 'boom' }, 20)).toMatch(/could not swap files: boom/);
    expect(runProblem({ depsWithoutInstall: false, withoutRun: res({ timedOut: true }) }, 20)).toBe(
      'tests took longer than 20 minutes (without the change)',
    );
    expect(runProblem({ depsWithoutInstall: false, withRun: res({ exitCode: 127 }) }, 20)).toBe(
      'test command could not start (with the change)',
    );
  });

  it('returns nothing when the runs were clean', () => {
    expect(runProblem({ depsWithoutInstall: false, withRun: res(), withoutRun: res({ exitCode: 1 }) }, 20)).toBeUndefined();
  });
});

describe('decideVerdict', () => {
  it('puts run problems first', () => {
    expect(decideVerdict('timed out', cmp({ proof: 3 }))).toEqual({ verdict: 'inconclusive', reason: 'timed out' });
  });

  it('ranks broken tests above proof', () => {
    expect(decideVerdict(undefined, cmp({ proof: 1, broken: 1 })).verdict).toBe('breaks-tests');
  });

  it('finds proof', () => {
    expect(decideVerdict(undefined, cmp({ proof: 1, 'not-comparable': 2 })).verdict).toBe('proof-found');
  });

  it('is inconclusive when nothing proves the change and some tests could not be compared', () => {
    const d = decideVerdict(undefined, cmp({ independent: 4, 'not-comparable': 1 }));
    expect(d.verdict).toBe('inconclusive');
    expect(d.reason).toMatch(/could not be compared/);
  });

  it('otherwise says no proof', () => {
    expect(decideVerdict(undefined, cmp({ independent: 4 })).verdict).toBe('no-proof');
  });
});

describe('decideFallback', () => {
  it('compares exit codes', () => {
    expect(decideFallback(undefined, res({ exitCode: 1 }), res()).verdict).toBe('proof-found');
    expect(decideFallback(undefined, res(), res()).verdict).toBe('no-proof');
    expect(decideFallback(undefined, res(), res({ exitCode: 1 })).verdict).toBe('breaks-tests');
    const both = decideFallback(undefined, res({ exitCode: 1 }), res({ exitCode: 2 }));
    expect(both).toEqual({ verdict: 'inconclusive', reason: 'tests fail both with and without the change' });
  });

  it('puts run problems first', () => {
    expect(decideFallback('boom', res({ exitCode: 1 }), res()).verdict).toBe('inconclusive');
  });
});
