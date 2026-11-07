import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearJUnitFiles, parseJUnit, readJUnitFiles } from '../../src/check/junit';

const PYTEST = `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite name="pytest">
<testcase classname="tests.test_parser" name="test_ok"/>
<testcase classname="tests.test_parser" name="test_unicode"><failure message="AssertionError: expected 1">assert 2 == 1</failure></testcase>
<testcase classname="tests.test_parser" name="test_later"><skipped message="later"/></testcase>
<testcase classname="" name="tests.test_new"><error message="collection failure">ImportError: cannot import name 'parse_new'</error></testcase>
</testsuite></testsuites>`;

const JEST = `<testsuites name="jest tests"><testsuite name="parser">
<testcase classname="parser handles unicode" name="parser handles unicode"><failure>Error: expect(received).toBe(expected)</failure></testcase>
</testsuite></testsuites>`;

const SUREFIRE = `<testsuite name="com.example.ParserTest"><testcase name="parses" classname="com.example.ParserTest"/></testsuite>`;

const NESTED = `<testsuites><testsuite name="outer" file="src/a.test.ts"><testsuite name="inner">
<testcase name="adds" classname=""/></testsuite><testcase name="subtracts" classname="" file="src/b.test.ts"/></testsuite></testsuites>`;

describe('parseJUnit', () => {
  it('reads pytest output including errors and skips', () => {
    const tests = parseJUnit(PYTEST);
    expect(tests.map((t) => [t.id, t.status])).toEqual([
      ['tests.test_parser::test_ok', 'pass'],
      ['tests.test_parser::test_unicode', 'fail'],
      ['tests.test_parser::test_later', 'skip'],
      ['tests.test_new', 'fail'],
    ]);
    expect(tests[1]?.message).toBe('AssertionError: expected 1');
    expect(tests[3]?.message).toBe('collection failure');
  });

  it('uses element text when there is no message attribute', () => {
    expect(parseJUnit(JEST)[0]?.message).toBe('Error: expect(received).toBe(expected)');
  });

  it('accepts a testsuite root element', () => {
    expect(parseJUnit(SUREFIRE)[0]?.id).toBe('com.example.ParserTest::parses');
  });

  it('walks nested suites and takes file from the case or the suite', () => {
    const tests = parseJUnit(NESTED);
    expect(tests.map((t) => t.id).sort()).toEqual(['adds', 'src/b.test.ts::subtracts']);
    expect(tests.find((t) => t.name === 'subtracts')?.file).toBe('src/b.test.ts');
  });

  it('rejects malformed xml', () => {
    expect(() => parseJUnit('<testsuites><testsuite>')).toThrow(/unreadable JUnit XML/);
    expect(() => parseJUnit('<html></html>')).toThrow(/unreadable JUnit XML/);
  });
});

describe('reading and clearing files', () => {
  it('reads every matching file and records bad ones', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'redgreen-junit-'));
    await mkdir(join(dir, 'reports'));
    await writeFile(join(dir, 'reports/a.xml'), PYTEST);
    await writeFile(join(dir, 'reports/b.xml'), SUREFIRE);
    await writeFile(join(dir, 'reports/bad.xml'), '<nope');
    const read = await readJUnitFiles(dir, 'reports/*.xml');
    expect(read.files).toBe(3);
    expect(read.tests).toHaveLength(5);
    expect(read.errors).toHaveLength(1);
    await clearJUnitFiles(dir, 'reports/*.xml');
    expect((await readJUnitFiles(dir, 'reports/*.xml')).files).toBe(0);
    await rm(dir, { recursive: true, force: true });
  });
});
