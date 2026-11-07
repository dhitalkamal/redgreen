import { readFileSync } from 'node:fs';
import { makeConfig, type EngineConfig } from '../../../src/check/config';
import { makeRepo, mergePr, type TempRepo } from './repo';

export type Edit = (repo: TempRepo) => Promise<void>;

export const NODE = JSON.stringify(process.execPath);
const RUNNER = readFileSync(new URL('../../fixtures/minirunner.cjs', import.meta.url), 'utf8');

export const VALUE_TEST = `const { value } = require('../src/value.cjs');
exports['returns two'] = () => {
  const v = value();
  if (v !== 2) throw new Error('AssertionError: expected 2, got ' + v);
};
`;
export const PASSES_ANYWAY = "exports['always'] = () => {};\n";

// base: the runner, value() returning 1, one passing test; pr edits merge like GitHub's merge ref
export async function scenario(edit: Edit, baseEdit?: Edit): Promise<TempRepo> {
  const repo = await makeRepo();
  await repo.write('minirunner.cjs', RUNNER);
  await repo.write('src/value.cjs', 'exports.value = () => 1;\n');
  await repo.write('tests/existing.test.cjs', "exports['truth'] = () => {};\n");
  if (baseEdit) await baseEdit(repo);
  await repo.commit('base');
  await repo.run(['switch', '-q', '-c', 'pr']);
  await edit(repo);
  await repo.commit('pr');
  await mergePr(repo, 'pr');
  return repo;
}

export const fixValue: Edit = async (repo) => {
  await repo.write('src/value.cjs', 'exports.value = () => 2;\n');
  await repo.write('tests/value.test.cjs', VALUE_TEST);
};

export function miniConfig(repo: TempRepo, overrides: Partial<EngineConfig> = {}): EngineConfig {
  return makeConfig(repo.dir, `${NODE} minirunner.cjs`, { junitPath: 'reports/*.xml', ...overrides });
}
