import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
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

const NODE = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
<testcase name="discount takes a percent off" time="0.001" classname="test" file="/w/tests/discount.test.js">
<failure type="testCodeFailure" message="Expected values to be strictly equal">AssertionError</failure>
</testcase>
<testcase name="total adds items" time="0.001" classname="test" file="/w/tests/total.test.js"/>
<!-- tests 2 -->
</testsuites>`;

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

  // node --test-reporter=junit puts cases straight under testsuites, with no testsuite
  it('reads cases placed directly under the testsuites root', () => {
    const tests = parseJUnit(NODE);
    expect(tests.map((t) => [t.id, t.status])).toEqual([
      ['test::discount takes a percent off', 'fail'],
      ['test::total adds items', 'pass'],
    ]);
    expect(tests[0]?.message).toBe('Expected values to be strictly equal');
    expect(tests[1]?.file).toBe('/w/tests/total.test.js');
  });

  // node escapes newlines in message attributes as numeric character references
  it('decodes numeric character references in messages', () => {
    const xml = '<testsuites><testcase name="t" classname="c"><failure message="a:&#10;&#10;190 !== 180 &#x41;"/></testcase></testsuites>';
    expect(parseJUnit(xml)[0]?.message).toBe('a:\n\n190 !== 180 A');
  });

  // node reports absolute files; load-error proof matches on repo-relative paths
  it('makes case files relative to the run directory when given one', () => {
    const tests = parseJUnit(NODE.replace('/w/tests/discount.test.js', '/elsewhere/d.test.js'), ['/w']);
    expect(tests[1]?.file).toBe('tests/total.test.js');
    expect(tests[0]?.file).toBe('/elsewhere/d.test.js');
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

  // on macos tmpdir is a symlink, and node writes the resolved path into file=
  it('relativizes absolute case files against the real run directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'redgreen-junit-'));
    const real = await realpath(dir);
    await writeFile(join(dir, 'junit.xml'), NODE.replaceAll('/w/', `${real}/`));
    const read = await readJUnitFiles(dir, 'junit.xml');
    expect(read.tests.map((t) => t.file)).toEqual(['tests/discount.test.js', 'tests/total.test.js']);
    await rm(dir, { recursive: true, force: true });
  });
});
