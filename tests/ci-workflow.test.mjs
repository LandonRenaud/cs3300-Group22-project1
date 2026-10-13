import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('CI tests pushes and pull requests, and deploys only after green trusted main pushes', async () => {
  const workflow = await readFile(new URL('../.github/workflows/project1-ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /\n  push:\s*\n    branches:\s*\n      - "\*\*"/);
  assert.match(workflow, /permissions:\s*\n  contents: read/);
  assert.match(workflow, /\n  pull_request:\s*\n    branches:\s*\n      - main/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /- closed/);
  assert.match(workflow, /needs:\s*\n      - maven-tests\s*\n      - location-marker-tests/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /id-token: write/);
});
