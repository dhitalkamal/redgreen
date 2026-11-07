import { describe, expect, it } from 'vitest';
import { VERDICTS, allLabels, isVerdict, labelFor } from '../../src/shared/verdicts';

describe('verdicts', () => {
  it('lists the five verdicts in rule order', () => {
    expect(VERDICTS).toEqual([
      'inconclusive',
      'breaks-tests',
      'proof-found',
      'no-proof',
      'no-proof-yet',
    ]);
  });

  it('maps each shown result to its label', () => {
    expect(labelFor('proof-found')).toBe('proof: found');
    expect(labelFor('no-proof')).toBe('proof: none');
    expect(labelFor('no-proof-yet')).toBe('proof: missing');
    expect(labelFor('breaks-tests')).toBe('proof: breaks-tests');
    expect(labelFor('inconclusive')).toBe('proof: inconclusive');
    expect(labelFor('unverified')).toBe('proof: unverified');
  });

  it('supports a custom prefix', () => {
    expect(labelFor('proof-found', 'rg/')).toBe('rg/found');
  });

  it('lists every label so stale ones can be removed', () => {
    expect(allLabels()).toHaveLength(6);
    expect(allLabels()).toContain('proof: unverified');
  });

  it('recognizes verdict strings', () => {
    expect(isVerdict('no-proof')).toBe(true);
    expect(isVerdict('unverified')).toBe(false);
  });
});
