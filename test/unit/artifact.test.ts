import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactError, downloadResults, parseResults, type FindBy } from '../../src/report/artifact';

const valid = {
  schemaVersion: 1, tool: 'redgreen 0.1.0', pr: 3, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40),
  mergeSha: 'c'.repeat(40), mode: 'junit', verdict: 'no-proof',
  counts: { proof: 0, independent: 1, alreadyFailing: 0, broken: 0, notComparable: 0, flaky: 0, skipped: 0 },
  proof: [], broken: [], changed: { test: 1, dependency: 0, other: 0 }, mentionsNotFound: [], flags: [],
  timings: { withSeconds: 1, withoutSeconds: 1 },
};
const findBy: FindBy = { token: 't', workflowRunId: 9, repositoryOwner: 'o', repositoryName: 'r' };

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'redgreen-art-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// a fake artifact client whose download writes whatever the test wants
function client(size: number, write: (d: string) => Promise<void>) {
  return {
    getArtifact: async () => ({ artifact: { id: 1, size } }),
    downloadArtifact: async (_id: number, opts: { path: string }) => write(opts.path),
  };
}

describe('parseResults', () => {
  it('accepts valid results and rejects bad input', () => {
    expect(parseResults(JSON.stringify(valid)).pr).toBe(3);
    expect(() => parseResults('{nope')).toThrow(/not valid JSON/);
    expect(() => parseResults(JSON.stringify({ ...valid, extra: true }))).toThrow(ArtifactError);
    expect(() => parseResults('x'.repeat(1024 * 1024 + 1))).toThrow(/larger than 1 MB/);
  });
});

describe('downloadResults', () => {
  it('downloads and validates results.json', async () => {
    const c = client(100, (d) => writeFile(join(d, 'results.json'), JSON.stringify(valid)));
    expect((await downloadResults(c, 'redgreen-results', findBy, dir)).verdict).toBe('no-proof');
  });

  it('refuses a large artifact before downloading', async () => {
    const c = client(2 * 1024 * 1024, async () => {
      throw new Error('should not download');
    });
    await expect(downloadResults(c, 'redgreen-results', findBy, dir)).rejects.toThrow(/larger than 1 MB/);
  });

  it('refuses a missing file or a symlink', async () => {
    await expect(downloadResults(client(1, async () => {}), 'n', findBy, dir)).rejects.toThrow(/missing/);
    const c = client(1, (d) => symlink('/etc/hosts', join(d, 'results.json')));
    await expect(downloadResults(c, 'n', findBy, dir)).rejects.toThrow(/not a regular file/);
  });
});
