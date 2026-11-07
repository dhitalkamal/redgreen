import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCommand } from '../../src/check/runner';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'redgreen-run-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const node = JSON.stringify(process.execPath);
const opts = () => ({ cwd: dir, timeoutMs: 10_000 });

describe('runCommand', () => {
  it('returns the exit code and output', async () => {
    const r = await runCommand(`${node} -e "console.log('hi'); process.exit(3)"`, opts());
    expect(r.exitCode).toBe(3);
    expect(r.timedOut).toBe(false);
    expect(r.outputTail).toContain('hi');
  });

  it('reports 127 for a missing command', async () => {
    const r = await runCommand('definitely-not-a-command-xyz', opts());
    expect(r.exitCode).toBe(127);
  });

  it('times out and kills the command', async () => {
    const r = await runCommand(`${node} -e "setTimeout(() => {}, 60000)"`, { cwd: dir, timeoutMs: 500 });
    expect(r.timedOut).toBe(true);
    expect(r.durationMs).toBeLessThan(5000);
  });

  it('keeps only the tail of long output', async () => {
    const r = await runCommand(`${node} -e "process.stdout.write('x'.repeat(5000) + 'END')"`, {
      ...opts(),
      tailBytes: 100,
    });
    expect(r.outputTail.length).toBe(100);
    expect(r.outputTail.endsWith('END')).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('kills processes the tests leave behind', async () => {
    const script = join(dir, 'bg.cjs');
    // unref so bg.cjs exits at once and the grandchild is really left behind;
    // without it node waits for the child and late.txt is written before exit
    await writeFile(
      script,
      "require('node:child_process').spawn(process.execPath, ['-e', " +
        "\"setTimeout(() => require('node:fs').writeFileSync('late.txt', 'x'), 1500)\"], { stdio: 'inherit' }).unref();\n",
    );
    const r = await runCommand(`${node} bg.cjs`, opts());
    expect(r.exitCode).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(existsSync(join(dir, 'late.txt'))).toBe(false);
  });
});
