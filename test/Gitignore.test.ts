import { readFileSync } from 'fs';

describe('.gitignore', () => {
  it('keeps generated database backups out of Git', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(gitignore).toMatch(/^backups\/$/m);
  });
});
