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
const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);

// exit-code mode has no per-test results, so the sentences talk about the command
function explainCoarse(shown: Shown): string | undefined {
  switch (shown) {
    case 'proof-found':
      return 'The test command fails without this change and passes with it.';
    case 'breaks-tests':
      return 'The test command passes without this change and fails with it.';
    case 'no-proof':
      return 'The test command passes both with and without this change. Could you add a test that fails on the current code?';
    default:
      return undefined;
  }
}

function explain(r: Results, shown: Shown): string {
  const coarse = r.mode === 'exit-code' ? explainCoarse(shown) : undefined;
  if (coarse) return coarse;
  switch (shown) {
    case 'proof-found':
      return `${tests(r.counts.proof)} ${verb(r.counts.proof, 'fails', 'fail')} without this change and ${verb(r.counts.proof, 'passes', 'pass')} with it.`;
    case 'no-proof': {
      // fail/fail tests are not proof, but saying "the tests pass" would be false for them
      const both = r.counts.alreadyFailing;
      const failBoth = both > 0 ? ` ${tests(both)} ${verb(both, 'fails', 'fail')} both with and without it.` : '';
      return `No test fails without this change and passes with it.${failBoth} Could you add a test that fails on the current code?`;
    }
    case 'no-proof-yet':
      return "This PR doesn't add or change tests. If it fixes a bug, a test that fails without the fix helps maintainers review it faster.";
    case 'breaks-tests':
      return `${tests(r.broken.length)} that passed before ${verb(r.broken.length, 'fails', 'fail')} with this change.`;
    case 'inconclusive':
      return 'redgreen could not get a clean comparison.';
    case 'unverified':
      return 'This result cannot be trusted.';
  }
}

type ProofEntry = Results['proof'][number];

// a load error fails every test in a file or go package with one message; one line per message
function groupProof(proof: ProofEntry[]): ProofEntry[][] {
  const groups = new Map<string, ProofEntry[]>();
  for (const p of proof) {
    const key = `${p.kind}\0${p.suspect}\0${p.message}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()];
}

function proofLine(group: ProofEntry[]): string {
  const first = group[0] as ProofEntry;
  const ids = group.slice(0, 3).map((p) => inlineCode(p.id)).join(', ');
  const more = group.length > 3 ? ` and ${group.length - 3} more` : '';
  return `- ${ids}${more}: without the change, ${inlineCode(first.message)}` +
    (first.suspect ? ' (may be a misplaced support file, not a missing fix)' : '');
}

function proofLines(r: Results): string[] {
  const shown = groupProof(r.proof).slice(0, MAX_PROOF);
  const out: string[] = [];
  const assertion = shown.filter((g) => g[0]?.kind === 'assertion');
  const missing = shown.filter((g) => g[0]?.kind === 'missing-code');
  if (assertion.length > 0) out.push('Fails on an assertion without the change:', ...assertion.map(proofLine), '');
  if (missing.length > 0) out.push('Fails because new code is missing without the change:', ...missing.map(proofLine), '');
  const rest = r.counts.proof - shown.reduce((n, g) => n + g.length, 0);
  if (rest > 0) out.push(`and ${rest} more not listed`, '');
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
  if (r.flags.includes('coarse')) {
    const none = r.flags.includes('no-results-without-change')
      ? ' Without the change the tests produced no results, for example because they did not compile.'
      : '';
    lines.push(`Only the whole test command could be compared, not individual tests.${none}`, '');
  }
  lines.push(`[How to prove your change](${opts.guideUrl}) | [Run details](${opts.runUrl})`);
  return lines.join('\n');
}
