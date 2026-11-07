import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeConfig } from '../../src/check/config';
import { runInstall, runSide } from '../../src/check/side';

const node = JSON.stringify(process.execPath);
const EMIT = `const fs = require('node:fs');
const n = fs.existsSync('.count') ? Number(fs.readFileSync('.count', 'utf8')) : 0;
fs.writeFileSync('.count', String(n + 1));
const ok = process.argv[2] !== 'flip' || n % 2 === 0;
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/junit.xml', '<testsuites><testsuite name="s"><testcase classname="t" name="x">' +
  (ok ? '' : '<failure message="flip"/>') + '</testcase></testsuite></testsuites>');
process.exit(ok ? 0 : 1);
`;

let dir: string;
const log = () => {};
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'redgreen-side-'));
  await writeFile(join(dir, 'emit.cjs'), EMIT);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('runSide', () => {
  it('returns tests from fresh JUnit files and clears stale ones first', async () => {
    await mkdir(join(dir, 'reports'));
    await writeFile(join(dir, 'reports/old.xml'), '<testsuites/>');
    const side = await runSide(makeConfig(dir, `${node} emit.cjs`, { junitPath: 'reports/*.xml' }), 'with', log);
    expect(side.run.exitCode).toBe(0);
    expect(side.tests?.map((t) => t.id)).toEqual(['t::x']);
    expect(side.junitFiles).toBe(1);
    expect(existsSync(join(dir, 'reports/old.xml'))).toBe(false);
  });

  it('flags tests that flip between retries', async () => {
    const cfg = makeConfig(dir, `${node} emit.cjs flip`, { junitPath: 'reports/*.xml', retries: 1 });
    const side = await runSide(cfg, 'with', log);
    expect([...side.flaky]).toEqual(['t::x']);
  });

  it('returns no tests without a junit path', async () => {
    const side = await runSide(makeConfig(dir, `${node} emit.cjs`), 'without', log);
    expect(side.tests).toBeUndefined();
    expect(side.run.exitCode).toBe(0);
  });
});

describe('runInstall', () => {
  it('does nothing without an install command and throws when it fails', async () => {
    await expect(runInstall(makeConfig(dir, 'true'), 'with', log)).resolves.toBeUndefined();
    const cfg = makeConfig(dir, 'true', { installCommand: `${node} -e "process.exit(3)"` });
    await expect(runInstall(cfg, 'without', log)).rejects.toThrow('the install command exited with code 3');
  });
});
