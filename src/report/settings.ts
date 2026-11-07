import { parsePatternList } from '../check/patterns';
import { InputError, listOr, parseBool, type GetInput } from '../shared/inputs';
import { isVerdict, type Shown } from '../shared/verdicts';
import { DEFAULT_TRUST_PATTERNS } from './trust';

export type Mode = 'advisory' | 'blocking';

export interface ReportSettings {
  checkWorkflow: string; mode: Mode; blockOn: Shown[]; labels: boolean; labelPrefix: string;
  comment: boolean; skipAuthors: string[]; skipDrafts: boolean; trustPatterns: string[]; guideUrl: string;
}

const DEFAULT_SKIP = ['dependabot[bot]', 'renovate[bot]', 'github-actions[bot]'];

export function readSettings(get: GetInput, actionRepo?: string): ReportSettings {
  const mode = get('mode').trim() || 'advisory';
  if (mode !== 'advisory' && mode !== 'blocking') throw new InputError(`input mode must be advisory or blocking, got "${mode}"`);
  const blockOn = parsePatternList(get('block-on').trim() || 'no-proof,breaks-tests').map((value): Shown => {
    if (value !== 'unverified' && !isVerdict(value)) throw new InputError(`input block-on has an unknown result "${value}"`);
    return value as Shown;
  });
  return {
    checkWorkflow: get('check-workflow').trim() || '.github/workflows/redgreen.yml',
    mode,
    blockOn,
    labels: parseBool(get, 'labels', true),
    labelPrefix: get('label-prefix') === '' ? 'proof: ' : get('label-prefix'),
    comment: parseBool(get, 'comment', true),
    skipAuthors: listOr(get, 'skip-authors', DEFAULT_SKIP),
    skipDrafts: parseBool(get, 'skip-drafts', false),
    trustPatterns: listOr(get, 'trust-patterns', DEFAULT_TRUST_PATTERNS),
    guideUrl:
      get('guide-url').trim() ||
      `https://github.com/${actionRepo || 'redgreen/redgreen'}/blob/main/docs/prove-your-change.md`,
  };
}
