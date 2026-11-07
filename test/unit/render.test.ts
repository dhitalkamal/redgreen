import { describe, expect, it } from 'vitest';
import { inlineCode } from '../../src/report/escape';
import { MARKER, renderComment } from '../../src/report/render';
import type { Results } from '../../src/shared/schema';

const opts = { guideUrl: 'https://example.invalid/guide', runUrl: 'https://example.invalid/run/1' };

function results(overrides: Partial<Results> = {}): Results {
  return {
    schemaVersion: 1, tool: 'redgreen 0.1.0', pr: 3,
    headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), mergeSha: 'c'.repeat(40),
    mode: 'junit', verdict: 'proof-found',
    counts: { proof: 1, independent: 4, alreadyFailing: 0, broken: 0, notComparable: 0, flaky: 0, skipped: 0 },
    proof: [{ id: 'tests::adds', message: 'AssertionError: 2 != 3', kind: 'assertion', suspect: false }],
    broken: [], changed: { test: 1, dependency: 0, other: 1 }, mentionsNotFound: [], flags: [],
    timings: { withSeconds: 1, withoutSeconds: 1 },
    ...overrides,
  };
}

describe('inlineCode', () => {
  it('wraps text in a code span', () => {
    expect(inlineCode('abc')).toBe('`abc`');
  });

  it('uses a longer fence when the text contains backticks', () => {
    expect(inlineCode('a `b` c')).toBe('``a `b` c``');
    expect(inlineCode('`edge`')).toBe('`` `edge` ``');
  });

  it('neutralizes control, zero-width and bidi characters and cuts length', () => {
    expect(inlineCode('a\nb\tc')).toBe('`a b c`');
    expect(inlineCode('pay\u202Eload\u200B')).toBe('`payload`');
    expect(inlineCode('x'.repeat(300))).toBe('`' + 'x'.repeat(200) + '`');
  });
});

describe('renderComment', () => {
  it('starts with the marker and a headline', () => {
    const md = renderComment(results(), 'proof-found', opts);
    expect(md.split('\n')[0]).toBe(MARKER);
    expect(md).toContain('**redgreen: Proof found.** 1 test fails without this change and passes with it.');
    expect(md).toContain('[How to prove your change](https://example.invalid/guide)');
  });

  it('keeps hostile test names inside code spans', () => {
    const hostile = '@everyone [click](http://evil.invalid) <img src=x> **Approved**';
    const md = renderComment(results({ proof: [{ id: hostile, message: 'm', kind: 'assertion', suspect: false }] }), 'proof-found', opts);
    expect(md).toContain(`- ${inlineCode(hostile)}: without the change, ${inlineCode('m')}`);
    expect(md.replace(/`[^`]*`/g, '')).not.toMatch(/@everyone|<img|\[click\]/);
  });

  it('groups proof by kind, flags suspects and caps the list at 20', () => {
    const proof = [
      { id: 'miss', message: 'ImportError: x', kind: 'missing-code' as const, suspect: false },
      { id: 'sus', message: 'ENOENT data.json', kind: 'assertion' as const, suspect: true },
      ...Array.from({ length: 24 }, (_, i) => ({ id: `t${i}`, message: 'm', kind: 'assertion' as const, suspect: false })),
    ];
    const md = renderComment(results({ proof, counts: { ...results().counts, proof: 26 } }), 'proof-found', opts);
    expect(md).toContain('Fails on an assertion without the change:');
    expect(md).toContain('Fails because new code is missing without the change:');
    expect(md).toContain('(may be a misplaced support file, not a missing fix)');
    expect(md).toContain('and 6 more');
  });

  it('explains every other verdict', () => {
    expect(renderComment(results({ verdict: 'no-proof', proof: [] }), 'no-proof', opts)).toContain(
      'The tests in this PR pass even without its code changes. Could you add a test that fails on the current code?',
    );
    expect(renderComment(results({ verdict: 'no-proof-yet', proof: [] }), 'no-proof-yet', opts)).toContain("doesn't add or change tests");
    const broken = results({ verdict: 'breaks-tests', broken: [{ id: 'old::t', message: 'expected 1' }] });
    expect(renderComment(broken, 'breaks-tests', opts)).toContain(`- ${inlineCode('old::t')}: ${inlineCode('expected 1')}`);
    const inc = results({ verdict: 'inconclusive', reason: 'tests took longer than 20 minutes', proof: [] });
    expect(renderComment(inc, 'inconclusive', opts)).toContain(`Reason: ${inlineCode('tests took longer than 20 minutes')}`);
  });

  it('marks unverified results and names the files', () => {
    const md = renderComment(results(), 'unverified', { ...opts, untrustedFiles: ['.github/workflows/redgreen.yml'] });
    expect(md).toContain('**redgreen: Unverified.**');
    expect(md).toContain(inlineCode('.github/workflows/redgreen.yml'));
    expect(md).toContain('Underlying verdict: Proof found.');
  });

  it('adds mentions and the coarse note', () => {
    const md = renderComment(results({ mentionsNotFound: ['parse_emoji'], flags: ['coarse'] }), 'proof-found', opts);
    expect(md).toContain(`Not found in this repository: ${inlineCode('parse_emoji')}`);
    expect(md).toContain('Only the whole test command could be compared, not individual tests.');
  });
});
