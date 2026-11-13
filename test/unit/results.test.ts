import { describe, expect, it } from 'vitest';
import { ZERO_COUNTS, type EngineResult } from '../../src/check/entries';
import { buildResults, renderSummary } from '../../src/check/results';
import { ResultsSchema } from '../../src/shared/schema';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

function engine(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    verdict: 'proof-found', mode: 'junit', headSha: B, baseSha: C,
    proof: [{ id: 'm::p', message: 'AssertionError: 2 != 3', kind: 'assertion', suspect: false }],
    broken: [], counts: { ...ZERO_COUNTS, proof: 1 }, changed: { test: 1, dependency: 0, other: 1 },
    flags: ['coarse'], timings: { withSeconds: 1.2, withoutSeconds: 1.1 }, outputTails: {},
    ...overrides,
  };
}

const meta = { pr: 7, prHeadSha: A, tool: 'redgreen 0.1.0', mentionsNotFound: [] as string[] };

describe('buildResults', () => {
  it('maps engine output and shas', () => {
    const r = buildResults(engine(), meta);
    expect(r).toMatchObject({ schemaVersion: 1, pr: 7, headSha: A, mergeSha: B, baseSha: C, verdict: 'proof-found' });
    expect(r.proof[0]).toEqual({ id: 'm::p', message: 'AssertionError: 2 != 3', kind: 'assertion', suspect: false });
  });

  it('applies every cap', () => {
    const long = 'x'.repeat(900);
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `t${i}`, message: 'm', kind: 'assertion' as const, suspect: false }));
    const r = buildResults(engine({ proof: [{ ...many[0]!, id: long }, ...many], reason: long }), {
      ...meta,
      mentionsNotFound: ['a', 'b', 'c', 'd', 'e', 'f', long],
    });
    expect(r.proof).toHaveLength(200);
    expect(r.proof[0]?.id).toHaveLength(500);
    expect(r.reason).toHaveLength(300);
    expect(r.mentionsNotFound).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('drops unknown flags', () => {
    expect(buildResults(engine({ flags: ['coarse', 'made-up'] }), meta).flags).toEqual(['coarse']);
  });
});

describe('ResultsSchema', () => {
  const valid = () => buildResults(engine(), meta);

  it('rejects unknown fields, bad shas and bad verdicts', () => {
    expect(ResultsSchema.safeParse({ ...valid(), extra: 1 }).success).toBe(false);
    expect(ResultsSchema.safeParse({ ...valid(), headSha: 'nope' }).success).toBe(false);
    expect(ResultsSchema.safeParse({ ...valid(), verdict: 'unverified' }).success).toBe(false);
    expect(ResultsSchema.safeParse(valid()).success).toBe(true);
  });
});

describe('renderSummary', () => {
  it('shows the verdict, proof, reason and output tails', () => {
    const r = buildResults(engine({ verdict: 'inconclusive', reason: 'tests took longer than 20 minutes' }), meta);
    const md = renderSummary(r, { with: 'line one\n```\nline two' });
    expect(md).toContain('## redgreen: inconclusive');
    expect(md).toContain('Reason: tests took longer than 20 minutes');
    expect(md).toContain('`m::p` (assertion): AssertionError: 2 != 3');
    expect(md).toContain('Output with the change');
    expect(md).not.toContain('line one\n```\nline two');
  });
});
