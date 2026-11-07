import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ResultsSchema, type Results } from '../shared/schema';

export const MAX_ARTIFACT_BYTES = 1024 * 1024;

export class ArtifactError extends Error {}

export interface FindBy {
  token: string;
  workflowRunId: number;
  repositoryOwner: string;
  repositoryName: string;
}

export interface ArtifactSource {
  getArtifact(name: string, opts: { findBy: FindBy }): Promise<{ artifact: { id: number; size: number } }>;
  downloadArtifact(id: number, opts: { path: string; findBy: FindBy }): Promise<unknown>;
}

export function parseResults(raw: string): Results {
  if (Buffer.byteLength(raw, 'utf8') > MAX_ARTIFACT_BYTES) throw new ArtifactError('results.json is larger than 1 MB');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ArtifactError('results.json is not valid JSON');
  }
  const parsed = ResultsSchema.safeParse(data);
  if (!parsed.success) {
    throw new ArtifactError(`results.json failed validation: ${parsed.error.issues[0]?.message ?? 'unknown issue'}`);
  }
  return parsed.data;
}

export async function downloadResults(client: ArtifactSource, name: string, findBy: FindBy, dir: string): Promise<Results> {
  const { artifact } = await client.getArtifact(name, { findBy });
  if (artifact.size > MAX_ARTIFACT_BYTES) throw new ArtifactError('results artifact is larger than 1 MB');
  await client.downloadArtifact(artifact.id, { path: dir, findBy });
  const file = join(dir, 'results.json');
  const info = await lstat(file).catch(() => undefined);
  if (!info) throw new ArtifactError('results.json is missing from the artifact');
  if (!info.isFile()) throw new ArtifactError('results.json is not a regular file');
  if (info.size > MAX_ARTIFACT_BYTES) throw new ArtifactError('results.json is larger than 1 MB');
  return parseResults(await readFile(file, 'utf8'));
}
