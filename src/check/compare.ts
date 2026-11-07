import type { TestCase } from './junit';
import { CODE_EXT } from './kinds';
import { indexRun } from './repeats';

export type Outcome = 'proof' | 'independent' | 'already-failing' | 'broken' | 'ignored' | 'not-comparable';

export interface Compared {
  id: string;
  outcome: Outcome;
  file?: string;
  withoutMessage?: string;
  withMessage?: string;
  viaLoadError: boolean;
}

export interface Comparison {
  items: Compared[];
  counts: Record<Outcome, number>;
}

export function moduleKey(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\\/g, '/').replace(CODE_EXT, '').replace(/\//g, '.');
}

const covers = (key: string, loadKey: string) => key === loadKey || key.startsWith(`${loadKey}.`);

function pairOutcome(before: TestCase['status'], after: TestCase['status']): Outcome {
  if (before === 'skip' || after === 'skip') return 'ignored';
  if (before === 'fail') return after === 'pass' ? 'proof' : 'already-failing';
  return after === 'pass' ? 'independent' : 'broken';
}

export function compareRuns(
  without: TestCase[],
  withChange: TestCase[],
  opts: { changedTestFiles: string[]; flaky?: Set<string> },
): Comparison {
  const before = indexRun(without);
  const after = indexRun(withChange);
  const flaky = opts.flaky ?? new Set<string>();
  const changedKeys = new Set(opts.changedTestFiles.map(moduleKey));

  const loadErrors = new Map<string, string | undefined>();
  for (const t of before.values()) {
    if (t.status !== 'fail' || after.has(t.id)) continue;
    for (const key of [t.name, t.classname, t.file].map(moduleKey)) {
      if (key && changedKeys.has(key)) loadErrors.set(key, t.message);
    }
  }

  const items: Compared[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(id);
    const a = after.get(id);
    const item: Compared = { id, outcome: 'ignored', file: (a ?? b)?.file, viaLoadError: false };
    if (b?.status === 'fail') item.withoutMessage = b.message;
    if (a?.status === 'fail') item.withMessage = a.message;
    if (flaky.has(id)) item.outcome = 'ignored';
    else if (a && b) item.outcome = pairOutcome(b.status, a.status);
    else if (a) {
      const keys = [a.classname, a.file].map(moduleKey).filter((k) => k !== '');
      const loadKey = [...loadErrors.keys()].find((lk) => keys.some((k) => covers(k, lk)));
      if (loadKey === undefined) item.outcome = a.status === 'skip' ? 'ignored' : 'not-comparable';
      else if (a.status === 'pass') {
        item.outcome = 'proof';
        item.viaLoadError = true;
        item.withoutMessage = loadErrors.get(loadKey);
      } else item.outcome = a.status === 'fail' ? 'already-failing' : 'ignored';
    }
    items.push(item);
  }

  const counts: Record<Outcome, number> = {
    proof: 0, independent: 0, 'already-failing': 0, broken: 0, ignored: 0, 'not-comparable': 0,
  };
  for (const item of items) counts[item.outcome] += 1;
  return { items, counts };
}
