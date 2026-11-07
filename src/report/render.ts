import type { Results } from '../shared/schema';
import type { Shown } from '../shared/verdicts';
import { inlineCode } from './escape';

export const MARKER = '<!-- redgreen:v1 -->';
const MAX_PROOF = 20;

export interface RenderOptions {
  guideUrl: string;
  runUrl: string;
  untrustedFiles?: string[];
}

export const HEADLINES: Record<Shown, string> = {
  'proof-found': 'Proof found',
  'no-proof': 'No proof',
  'no-proof-yet': 'No proof yet',
  'breaks-tests': 'Breaks tests',
  inconclusive: 'Inconclusive',
  unverified: 'Unverified',
};

const tests = (n: number) => (n === 1 ? '1 test' : `${n} tests`);

function explain(r: Results, shown: Shown): string {
  switch (shown) {
    case 'proof-found':
      return `${tests(r.proof.length)} ${r.proof.length === 1 ? 'fails' : 'fail'} without this change and ${r.proof.length === 1 ? 'passes' : 'pass'} with it.`;
    case 'no-proof':
      return 'The tests in this PR pass even without its code changes. Could you add a test that fails on the current code?';
    case 'no-proof-yet':
      return "This PR doesn't add or change tests. If it fixes a bug, a test that fails without the fix helps maintainers review it faster.";
    case 'breaks-tests':
      return `${tests(r.broken.length)} that passed before ${r.broken.length === 1 ? 'fails' : 'fail'} with this change.`;
    case 'inconclusive':
      return 'redgreen could not get a clean comparison.';
    case 'unverified':
      return 'This result cannot be trusted.';
  }
}

function proofLines(r: Results): string[] {
  const shownProof = r.proof.slice(0, MAX_PROOF);
  const line = (p: Results['proof'][number]) =>
    `- ${inlineCode(p.id)}: without the change, ${inlineCode(p.message)}` +
    (p.suspect ? ' (may be a misplaced support file, not a missing fix)' : '');
  const out: string[] = [];
  const assertion = shownProof.filter((p) => p.kind === 'assertion');
  const missing = shownProof.filter((p) => p.kind === 'missing-code');
  if (assertion.length > 0) out.push('Fails on an assertion without the change:', ...assertion.map(line), '');
  if (missing.length > 0) out.push('Fails because new code is missing without the change:', ...missing.map(line), '');
  const rest = r.counts.proof - shownProof.length;
  if (rest > 0) out.push(`and ${rest} more`, '');
  return out;
}

export function renderComment(r: Results, shown: Shown, opts: RenderOptions): string {
  const lines = [MARKER, `**redgreen: ${HEADLINES[shown]}.** ${explain(r, shown)}`, ''];
  if (shown === 'unverified') {
    const files = (opts.untrustedFiles ?? []).slice(0, 5).map((f) => inlineCode(f)).join(', ');
    lines.push(`This PR changes files that control how tests run (${files}). Underlying verdict: ${HEADLINES[r.verdict]}.`, '');
  }
  if (r.verdict === 'inconclusive' && r.reason) lines.push(`Reason: ${inlineCode(r.reason, 300)}`, '');
  if (r.proof.length > 0) lines.push(...proofLines(r));
  if (r.broken.length > 0) {
    lines.push('Broken by this change:', ...r.broken.slice(0, MAX_PROOF).map((b) => `- ${inlineCode(b.id)}: ${inlineCode(b.message)}`), '');
  }
  if (r.mentionsNotFound.length > 0) {
    lines.push(`Not found in this repository: ${r.mentionsNotFound.map((m) => inlineCode(m)).join(', ')}`, '');
  }
  if (r.flags.includes('coarse')) lines.push('Only the whole test command could be compared, not individual tests.', '');
  lines.push(`[How to prove your change](${opts.guideUrl}) | [Run details](${opts.runUrl})`);
  return lines.join('\n');
}
