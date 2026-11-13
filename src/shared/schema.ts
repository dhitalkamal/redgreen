import { z } from 'zod';
import { VERDICTS } from './verdicts';

export const ARTIFACT_NAME = 'redgreen-results';

export const FLAG_CODES = [
  'coarse', 'retries-used', 'suspect-support-file', 'junit-unreadable', 'junit-missing', 'no-results-without-change',
] as const;

const sha = z.string().regex(/^[0-9a-f]{40}$/);
const text = z.string().max(500);
const count = z.number().int().min(0);

// stage 2 treats the artifact as hostile, so every field is typed, capped and closed
export const ResultsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tool: z.string().max(50),
  pr: z.number().int().positive(),
  headSha: sha,
  baseSha: sha,
  mergeSha: sha,
  mode: z.enum(['junit', 'exit-code']),
  verdict: z.enum(VERDICTS),
  reason: z.string().max(300).optional(),
  counts: z.strictObject({
    proof: count, independent: count, alreadyFailing: count, broken: count,
    notComparable: count, flaky: count, skipped: count,
  }),
  proof: z
    .array(z.strictObject({ id: text, file: text.optional(), message: text, kind: z.enum(['assertion', 'missing-code']), suspect: z.boolean() }))
    .max(200),
  broken: z.array(z.strictObject({ id: text, file: text.optional(), message: text })).max(200),
  changed: z.strictObject({ test: count, dependency: count, other: count }),
  mentionsNotFound: z.array(z.string().max(200)).max(5),
  flags: z.array(z.enum(FLAG_CODES)).max(10),
  timings: z.strictObject({ withSeconds: z.number().min(0), withoutSeconds: z.number().min(0) }),
});

export type Results = z.infer<typeof ResultsSchema>;
