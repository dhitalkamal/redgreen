import type { Results } from '../shared/schema';

export interface RunInfo { path: string; event: string; headSha: string; headRepo: string }
export interface PullInfo { number: number; headSha: string; headRepo: string }

export async function verifyIdentity(
  run: RunInfo,
  results: Results,
  expectedPath: string,
  findPull: (n: number) => Promise<PullInfo | undefined>,
): Promise<string | null> {
  if (run.path !== expectedPath) return `results came from ${run.path}, expected ${expectedPath}`;
  if (run.event !== 'pull_request') return `results came from a ${run.event} event`;
  if (results.headSha !== run.headSha) return 'results are for a different commit than the run';
  const pull = await findPull(results.pr);
  if (!pull) return `pull request #${results.pr} was not found`;
  if (pull.headSha !== run.headSha || pull.headRepo !== run.headRepo) {
    return `pull request #${results.pr} does not match the run`;
  }
  return null;
}
