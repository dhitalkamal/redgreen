import type { Shown, Verdict } from '../shared/verdicts';
import type { Mode } from './settings';

export type Conclusion = 'success' | 'neutral' | 'failure';

export function shownResult(verdict: Verdict, untrusted: boolean): Shown {
  return untrusted ? 'unverified' : verdict;
}

export function checkConclusion(shown: Shown, mode: Mode, blockOn: Shown[]): Conclusion {
  if (mode === 'blocking' && blockOn.includes(shown)) return 'failure';
  return shown === 'proof-found' ? 'success' : 'neutral';
}
