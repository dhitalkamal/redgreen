import type { TestCase } from './junit';

const rank = (status: TestCase['status']) => (status === 'fail' ? 2 : status === 'pass' ? 1 : 0);

export function indexRun(tests: TestCase[]): Map<string, TestCase> {
  const map = new Map<string, TestCase>();
  for (const t of tests) {
    const prev = map.get(t.id);
    if (!prev || rank(t.status) > rank(prev.status)) map.set(t.id, t);
  }
  return map;
}

// a test whose pass or fail status differs between identical runs is flaky; skips do not count
export function mergeRepeats(runs: TestCase[][]): { tests: TestCase[]; flaky: Set<string> } {
  const indexed = runs.map(indexRun);
  const ids = new Set(indexed.flatMap((run) => [...run.keys()]));
  const flaky = new Set<string>();
  for (const id of ids) {
    const seen = new Set(indexed.map((run) => run.get(id)?.status ?? 'missing').filter((s) => s !== 'skip'));
    if (seen.size > 1) flaky.add(id);
  }
  return { tests: [...(indexed[0] ?? new Map<string, TestCase>()).values()], flaky };
}
