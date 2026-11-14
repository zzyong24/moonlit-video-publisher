// `ego-browser nodejs -e '<script>'` can hang (observed 2026-10-21 on 0.6.0.12/0.6.0.16);
// piping the script through stdin works. Every runner must use stdin, never -e/--eval.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['../run-platform.mjs', '../verify-account.mjs']) {
  test(`${file} sends its Ego script via stdin, not -e/--eval`, () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /spawn\([^)]*"ego-browser"\)?,\s*\["nodejs"\]/);
    assert.match(source, /child\.stdin\.end\(/);
    assert.doesNotMatch(source, /["'](?:-e|--eval)["']/);
  });
}
