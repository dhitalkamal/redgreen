import { afterEach, describe, expect, it } from 'vitest';
import { findMissing } from '../../src/check/mentions';
import { makeRepo, type TempRepo } from './helpers/repo';

let repo: TempRepo;
afterEach(async () => {
  await repo?.cleanup();
});

describe('findMissing', () => {
  it('reports only mentions that are not in the repository', async () => {
    repo = await makeRepo();
    await repo.write('src/lexer/escape.rs', 'fn parse_unicode() {}\nfn format_date() {}\n');
    await repo.write('README.md', 'docs');
    await repo.commit('base');
    const missing = await findMissing(repo.dir, [
      'parse_unicode', 'src/lexer/escape.rs', 'lexer/escape.rs', 'src/lexer', 'parse_emoji',
      'src/lexer/emoji.rs', 'helpers.format_date', 'helpers.format_time',
    ]);
    expect(missing).toEqual(['parse_emoji', 'src/lexer/emoji.rs', 'helpers.format_time']);
  });

  // rust paths and generics: the definition only ever spells the last segment
  it('looks up the last identifier of :: paths and generic calls', async () => {
    repo = await makeRepo();
    await repo.write('src/de.rs', 'impl Deserializer for Value {\n  fn deserialize_struct() {}\n}\nfn try_into() {}\n');
    await repo.commit('base');
    const missing = await findMissing(repo.dir, [
      'Value::deserialize_struct', 'try_into::<Datetime>', 'Value::<T>::deserialize_struct', 'Value::parse_missing',
    ]);
    expect(missing).toEqual(['Value::parse_missing']);
  });

  it('stops at five', async () => {
    repo = await makeRepo();
    await repo.write('a.txt', 'x');
    await repo.commit('base');
    const names = Array.from({ length: 8 }, (_, i) => `missing_name_${i}`);
    expect(await findMissing(repo.dir, names)).toHaveLength(5);
  });
});
