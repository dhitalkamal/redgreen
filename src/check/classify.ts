import type { Change } from './diff';
import { makeMatcher } from './patterns';

export type Group = 'test' | 'dependency' | 'other';

export interface Classified extends Change {
  group: Group;
}

export interface Classification {
  files: Classified[];
  counts: { test: number; dependency: number; other: number };
}

export function classify(
  changes: Change[],
  opts: { testPatterns: string[]; dependencyPatterns: string[] },
): Classification {
  const isTest = makeMatcher(opts.testPatterns);
  const isDependency = makeMatcher(opts.dependencyPatterns);
  const counts = { test: 0, dependency: 0, other: 0 };
  const files = changes.map((change): Classified => {
    const group: Group = isTest(change.path)
      ? 'test'
      : isDependency(change.path)
        ? 'dependency'
        : 'other';
    counts[group] += 1;
    return { ...change, group };
  });
  return { files, counts };
}
