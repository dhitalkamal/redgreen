import { describe, expect, it } from 'vitest';
import { checkConclusion, shownResult } from '../../src/report/conclusion';
import { readSettings } from '../../src/report/settings';
import { DEFAULT_TRUST_PATTERNS } from '../../src/report/trust';

const from = (values: Record<string, string>) => (name: string) => values[name] ?? '';

describe('readSettings', () => {
  it('applies defaults', () => {
    expect(readSettings(from({}), 'acme/redgreen')).toEqual({
      checkWorkflow: '.github/workflows/redgreen.yml', mode: 'advisory', blockOn: ['no-proof', 'breaks-tests'],
      labels: true, labelPrefix: 'proof: ', comment: true,
      skipAuthors: ['dependabot[bot]', 'renovate[bot]', 'github-actions[bot]'], skipDrafts: false,
      trustPatterns: DEFAULT_TRUST_PATTERNS, guideUrl: 'https://github.com/acme/redgreen/blob/main/docs/prove-your-change.md',
    });
  });

  it('reads overrides and keeps the label prefix as written', () => {
    const s = readSettings(from({ mode: 'blocking', 'block-on': 'unverified, inconclusive', 'label-prefix': 'rg: ', labels: 'false' }));
    expect(s).toMatchObject({ mode: 'blocking', blockOn: ['unverified', 'inconclusive'], labelPrefix: 'rg: ', labels: false });
  });

  it('rejects unknown values', () => {
    expect(() => readSettings(from({ mode: 'strict' }))).toThrow(/advisory or blocking/);
    expect(() => readSettings(from({ 'block-on': 'nope' }))).toThrow(/unknown result "nope"/);
    expect(() => readSettings(from({ comment: 'maybe' }))).toThrow(/true or false/);
  });
});

describe('conclusions', () => {
  it('overlays unverified', () => {
    expect(shownResult('proof-found', true)).toBe('unverified');
    expect(shownResult('no-proof', false)).toBe('no-proof');
  });

  it('never fails in advisory mode', () => {
    expect(checkConclusion('proof-found', 'advisory', ['no-proof'])).toBe('success');
    expect(checkConclusion('no-proof', 'advisory', ['no-proof'])).toBe('neutral');
    expect(checkConclusion('unverified', 'advisory', ['unverified'])).toBe('neutral');
  });

  it('fails listed results in blocking mode', () => {
    expect(checkConclusion('no-proof', 'blocking', ['no-proof'])).toBe('failure');
    expect(checkConclusion('inconclusive', 'blocking', ['no-proof'])).toBe('neutral');
    expect(checkConclusion('proof-found', 'blocking', ['no-proof'])).toBe('success');
  });
});
