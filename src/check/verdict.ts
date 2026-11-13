import type { Verdict } from '../shared/verdicts';
import type { Comparison } from './compare';
import type { RunResult } from './runner';

export interface RunFacts {
  withRun?: RunResult;
  withoutRun?: RunResult;
  swapFailed?: string;
  depsWithoutInstall: boolean;
}

export interface Decision {
  verdict: Verdict;
  reason?: string;
}

// the shell exits 126 or 127 when the command cannot be found or executed
export function couldNotStart(r: RunResult): boolean {
  return r.startError !== undefined || r.exitCode === 126 || r.exitCode === 127;
}

export function runProblem(facts: RunFacts, timeoutMinutes: number): string | undefined {
  if (facts.depsWithoutInstall) return 'dependencies changed and no install-command is configured';
  // covers the swap itself and the install that follows it
  if (facts.swapFailed) return `could not prepare the run without the change: ${facts.swapFailed}`;
  const runs = [
    ['with', facts.withRun],
    ['without', facts.withoutRun],
  ] as const;
  for (const [label, run] of runs) {
    if (!run) continue;
    if (run.timedOut) return `tests took longer than ${timeoutMinutes} minutes (${label} the change)`;
    if (couldNotStart(run)) return `test command could not start (${label} the change)`;
  }
  return undefined;
}

export function decideVerdict(problem: string | undefined, cmp: Comparison): Decision {
  if (problem) return { verdict: 'inconclusive', reason: problem };
  if (cmp.counts.broken > 0) return { verdict: 'breaks-tests' };
  if (cmp.counts.proof > 0) return { verdict: 'proof-found' };
  if (cmp.counts['not-comparable'] > 0) {
    return {
      verdict: 'inconclusive',
      reason: 'some tests could not be compared; they may live inside changed source files',
    };
  }
  return { verdict: 'no-proof' };
}

export function decideFallback(problem: string | undefined, without: RunResult, withChange: RunResult): Decision {
  if (problem) return { verdict: 'inconclusive', reason: problem };
  const withoutFails = without.exitCode !== 0;
  const withFails = withChange.exitCode !== 0;
  if (withoutFails && !withFails) return { verdict: 'proof-found' };
  if (!withoutFails && !withFails) return { verdict: 'no-proof' };
  if (!withoutFails && withFails) return { verdict: 'breaks-tests' };
  return { verdict: 'inconclusive', reason: 'tests fail both with and without the change' };
}
