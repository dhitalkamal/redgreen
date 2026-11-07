import { readFile, realpath, rm } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { glob } from 'tinyglobby';

export type TestStatus = 'pass' | 'fail' | 'skip';

export interface TestCase {
  id: string;
  name: string;
  classname: string;
  file?: string;
  // name of the testsuite element holding the case (gotestsum: the go package path)
  suite?: string;
  status: TestStatus;
  message?: string;
}

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  // decodes numeric references like &#10;, which node uses for newlines in messages
  htmlEntities: true,
  isArray: (name) => ['testsuite', 'testcase', 'failure', 'error', 'skipped'].includes(name),
});

const list = (value: unknown): Node[] =>
  value === undefined || value === '' ? [] : (Array.isArray(value) ? value : [value]) as Node[];

const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

// files outside every root stay absolute rather than becoming ../ paths
function relativeTo(file: string | undefined, roots: string[]): string | undefined {
  if (!file || !isAbsolute(file)) return file;
  for (const root of roots) {
    const rel = relative(root, file);
    if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) return rel.split(sep).join('/');
  }
  return file;
}

// jest-junit copies the full title into classname too, which would read "title::title"
export function testId(classname: string, name: string, file?: string): string {
  const scope = (classname !== name ? classname : '') || file || '';
  return scope ? `${scope}::${name}` : name;
}

// go test progress lines that gotestsum leaves around the real output
const GO_MARKER = /^\s*(=== (RUN|PAUSE|CONT|NAME)\s|--- FAIL:)/;

// the attribute is the usual summary, but some producers put the useful text in the body:
// nextest repeats the location attribute as the first body line and the panic text follows,
// gotestsum sets the attribute to the single word "Failed"
function messageOf(node: unknown): string | undefined {
  if (typeof node === 'string') return str(node.trim());
  if (!node || typeof node !== 'object') return undefined;
  const n = node as Node;
  const attr = str(n.message);
  const body = str(typeof n['#text'] === 'string' ? n['#text'].trim() : undefined);
  if (!attr || !body) return attr ?? body;
  if (body.startsWith(attr)) return body;
  if (/^\w+$/.test(attr)) {
    const kept = body.split(/\r?\n/).filter((line) => !GO_MARKER.test(line)).join('\n').trim();
    return kept || body;
  }
  return attr;
}

// absolute run-directory paths in stack traces are noise in a pr comment
function stripRoots(message: string | undefined, roots: string[]): string | undefined {
  if (!message) return message;
  return roots.reduce((text, root) => text.replaceAll(`${root}${sep}`, ''), message);
}

function collect(suite: Node, out: TestCase[], roots: string[]): void {
  const suiteName = str(suite.name);
  for (const tc of list(suite.testcase)) {
    const name = String(tc.name ?? '').trim();
    const classname = String(tc.classname ?? '').trim();
    const file = relativeTo(str(tc.file) ?? str(suite.file), roots);
    const failures = [...list(tc.failure), ...list(tc.error)];
    const status: TestStatus = failures.length > 0 ? 'fail' : list(tc.skipped).length > 0 ? 'skip' : 'pass';
    const message = failures.length > 0 ? stripRoots(messageOf(failures[0]), roots) : undefined;
    out.push({ id: testId(classname, name, file), name, classname, file, suite: suiteName, status, message });
  }
  for (const child of list(suite.testsuite)) collect(child, out, roots);
}

export function parseJUnit(xml: string, roots: string[] = []): TestCase[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`unreadable JUnit XML: ${valid.err.msg}`);
  const doc = parser.parse(xml) as Node;
  if (!('testsuites' in doc) && !('testsuite' in doc)) {
    throw new Error('unreadable JUnit XML: no testsuites or testsuite element');
  }
  const root = doc.testsuites && typeof doc.testsuites === 'object' ? (doc.testsuites as Node) : {};
  const out: TestCase[] = [];
  // collecting from the root also picks up cases placed directly under testsuites (node --test)
  collect(root, out, roots);
  for (const suite of list(doc.testsuite)) collect(suite, out, roots);
  return out;
}

export async function readJUnitFiles(
  cwd: string,
  pattern: string,
): Promise<{ tests: TestCase[]; files: number; errors: string[] }> {
  const paths = (await glob([pattern], { cwd, absolute: true, dot: true })).sort();
  const roots = [cwd, await realpath(cwd).catch(() => cwd)];
  const tests: TestCase[] = [];
  const errors: string[] = [];
  for (const path of paths) {
    try {
      tests.push(...parseJUnit(await readFile(path, 'utf8'), roots));
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
