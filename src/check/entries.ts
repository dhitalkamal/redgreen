import type { Verdict } from '../shared/verdicts';
import type { Comparison } from './compare';
import { isSuspect, oneLine, proofKind, type ProofKind } from './kinds';

export interface ProofEntry { id: string; file?: string; message: string; kind: ProofKind; suspect: boolean }
export interface BrokenEntry { id: string; file?: string; message: string }
export interface EngineCounts {
  proof: number; independent: number; alreadyFailing: number; broken: number;
  notComparable: number; flaky: number; skipped: number;
}

export interface EngineResult {
  verdict: Verdict;
  reason?: string;
  mode: 'junit' | 'exit-code';
  headSha: string;
  baseSha: string;
  proof: ProofEntry[];
  broken: BrokenEntry[];
  counts: EngineCounts;
  changed: { test: number; dependency: number; other: number };
  flags: string[];
  timings: { withSeconds: number; withoutSeconds: number };
  outputTails: { with?: string; without?: string };
}

export const ZERO_COUNTS: EngineCounts = {
  proof: 0, independent: 0, alreadyFailing: 0, broken: 0, notComparable: 0, flaky: 0, skipped: 0,
};

export function toEntries(cmp: Comparison, touched: string[]): { proof: ProofEntry[]; broken: BrokenEntry[] } {
  const proof = cmp.items
    .filter((i) => i.outcome === 'proof')
    .map((i) => ({
      id: i.id,
      file: i.file,
      message: oneLine(i.withoutMessage),
      kind: proofKind(i.withoutMessage, i.viaLoadError),
      suspect: isSuspect(i.withoutMessage, touched),
    }));
  const broken = cmp.items
    .filter((i) => i.outcome === 'broken')
    .map((i) => ({ id: i.id, file: i.file, message: oneLine(i.withMessage) }));
  return { proof, broken };
}

export function toCounts(cmp: Comparison, flaky: Set<string>): EngineCounts {
  const c = cmp.counts;
  const flakyCount = cmp.items.filter((i) => i.outcome === 'ignored' && flaky.has(i.id)).length;
  return {
    proof: c.proof, independent: c.independent, alreadyFailing: c['already-failing'], broken: c.broken,
    notComparable: c['not-comparable'], flaky: flakyCount, skipped: c.ignored - flakyCount,
  };
}
