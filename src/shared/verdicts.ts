// verdict names, in the order the rules are checked
export const VERDICTS = [
  'inconclusive',
  'breaks-tests',
  'proof-found',
  'no-proof',
  'no-proof-yet',
] as const;

export type Verdict = (typeof VERDICTS)[number];

// stage 2 can show any verdict as unverified instead
export type Shown = Verdict | 'unverified';

const LABEL_SUFFIX: Record<Shown, string> = {
  'proof-found': 'found',
  'no-proof': 'none',
  'no-proof-yet': 'missing',
  'breaks-tests': 'breaks-tests',
  inconclusive: 'inconclusive',
  unverified: 'unverified',
};

export function labelFor(shown: Shown, prefix = 'proof: '): string {
  return prefix + LABEL_SUFFIX[shown];
}

export function allLabels(prefix = 'proof: '): string[] {
  return (Object.keys(LABEL_SUFFIX) as Shown[]).map((s) => labelFor(s, prefix));
}

export function isVerdict(value: string): value is Verdict {
  return (VERDICTS as readonly string[]).includes(value);
}
