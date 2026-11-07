import { FLAG_CODES, ResultsSchema, type Results } from '../shared/schema';
import type { Verdict } from '../shared/verdicts';
import type { EngineResult } from './entries';

type Flag = (typeof FLAG_CODES)[number];
const isFlag = (flag: string): flag is Flag => (FLAG_CODES as readonly string[]).includes(flag);
const cut = (value: string, max = 500) => value.slice(0, max);
const withFile = (file?: string) => (file ? { file: cut(file) } : {});

export function buildResults(
  r: EngineResult,
  meta: { pr: number; prHeadSha: string; tool: string; mentionsNotFound: string[] },
): Results {
  // validating our own output catches cap mistakes here instead of in stage 2
  return ResultsSchema.parse({
    schemaVersion: 1,
    tool: cut(meta.tool, 50),
    pr: meta.pr,
    headSha: meta.prHeadSha,
    baseSha: r.baseSha,
    mergeSha: r.headSha,
    mode: r.mode,
    verdict: r.verdict,
    ...(r.reason ? { reason: cut(r.reason, 300) } : {}),
    counts: r.counts,
    proof: r.proof.slice(0, 200).map((p) => ({ id: cut(p.id), ...withFile(p.file), message: cut(p.message), kind: p.kind, suspect: p.suspect })),
    broken: r.broken.slice(0, 200).map((b) => ({ id: cut(b.id), ...withFile(b.file), message: cut(b.message) })),
    changed: r.changed,
    mentionsNotFound: meta.mentionsNotFound.slice(0, 5).map((m) => cut(m, 200)),
    flags: r.flags.filter(isFlag).slice(0, 10),
    timings: r.timings,
  });
}

const TITLES: Record<Verdict, string> = {
  'proof-found': 'proof found',
  'no-proof': 'no proof',
  'no-proof-yet': 'no proof yet',
  'breaks-tests': 'breaks tests',
  inconclusive: 'inconclusive',
};

export function renderSummary(results: Results, tails: { with?: string; without?: string } = {}): string {
  const c = results.counts;
  const lines = [`## redgreen: ${TITLES[results.verdict]}`, ''];
  if (results.reason) lines.push(`Reason: ${results.reason}`, '');
  lines.push(
    `Mode: ${results.mode}. Proof ${c.proof}, broken ${c.broken}, independent ${c.independent}, ` +
      `already failing ${c.alreadyFailing}, not comparable ${c.notComparable}, flaky ${c.flaky}, skipped ${c.skipped}.`,
    '',
  );
  if (results.proof.length > 0) {
    lines.push('### Proof', ...results.proof.map((p) => `- \`${p.id}\` (${p.kind}${p.suspect ? ', suspect' : ''}): ${p.message}`), '');
  }
  if (results.broken.length > 0) lines.push('### Broken', ...results.broken.map((b) => `- \`${b.id}\`: ${b.message}`), '');
  if (results.mentionsNotFound.length > 0) {
    lines.push(`Not found in this repository: ${results.mentionsNotFound.map((m) => `\`${m}\``).join(', ')}`, '');
  }
  if (results.flags.length > 0) lines.push(`Flags: ${results.flags.join(', ')}`, '');
  for (const [label, tail] of [['with', tails.with], ['without', tails.without]] as const) {
    if (!tail) continue;
    // a fence inside the output would end our code block early
    const safe = tail.replace(/`{3,}/g, "'''");
    lines.push(`<details><summary>Output ${label} the change (last part)</summary>`, '', '```', safe, '```', '', '</details>', '');
  }
  return lines.join('\n');
}
