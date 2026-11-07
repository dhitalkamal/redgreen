import { readFile, rm } from 'node:fs/promises';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { glob } from 'tinyglobby';

export type TestStatus = 'pass' | 'fail' | 'skip';

export interface TestCase {
  id: string;
  name: string;
  classname: string;
  file?: string;
  status: TestStatus;
  message?: string;
}

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  isArray: (name) => ['testsuite', 'testcase', 'failure', 'error', 'skipped'].includes(name),
});

const list = (value: unknown): Node[] =>
  value === undefined || value === '' ? [] : (Array.isArray(value) ? value : [value]) as Node[];

const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

export function testId(classname: string, name: string, file?: string): string {
  const scope = classname || file || '';
  return scope ? `${scope}::${name}` : name;
}

function messageOf(node: unknown): string | undefined {
  if (typeof node === 'string') return str(node.trim());
  if (node && typeof node === 'object') {
    const n = node as Node;
    return str(n.message) ?? str(typeof n['#text'] === 'string' ? n['#text'].trim() : undefined);
  }
  return undefined;
}

function collect(suite: Node, out: TestCase[]): void {
  for (const tc of list(suite.testcase)) {
    const name = String(tc.name ?? '');
    const classname = String(tc.classname ?? '');
    const file = str(tc.file) ?? str(suite.file);
    const failures = [...list(tc.failure), ...list(tc.error)];
    const status: TestStatus = failures.length > 0 ? 'fail' : list(tc.skipped).length > 0 ? 'skip' : 'pass';
    const message = failures.length > 0 ? messageOf(failures[0]) : undefined;
    out.push({ id: testId(classname, name, file), name, classname, file, status, message });
  }
  for (const child of list(suite.testsuite)) collect(child, out);
}

export function parseJUnit(xml: string): TestCase[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`unreadable JUnit XML: ${valid.err.msg}`);
  const doc = parser.parse(xml) as Node;
  if (!('testsuites' in doc) && !('testsuite' in doc)) {
    throw new Error('unreadable JUnit XML: no testsuites or testsuite element');
  }
  const root = doc.testsuites && typeof doc.testsuites === 'object' ? (doc.testsuites as Node) : {};
  const out: TestCase[] = [];
  for (const suite of [...list(root.testsuite), ...list(doc.testsuite)]) collect(suite, out);
  return out;
}

export async function readJUnitFiles(
  cwd: string,
  pattern: string,
): Promise<{ tests: TestCase[]; files: number; errors: string[] }> {
  const paths = (await glob([pattern], { cwd, absolute: true, dot: true })).sort();
  const tests: TestCase[] = [];
  const errors: string[] = [];
  for (const path of paths) {
    try {
      tests.push(...parseJUnit(await readFile(path, 'utf8')));
    } catch (error) {
      errors.push(`${path}: ${(error as Error).message}`);
    }
  }
  return { tests, files: paths.length, errors };
}

export async function clearJUnitFiles(cwd: string, pattern: string): Promise<void> {
  const paths = await glob([pattern], { cwd, absolute: true, dot: true });
  await Promise.all(paths.map((path) => rm(path, { force: true })));
}
