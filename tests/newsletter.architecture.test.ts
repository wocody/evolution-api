import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

describe('newsletter endpoint isolation', () => {
  it('does not add newsletter behavior to the conventional message endpoint', async () => {
    const files = await Promise.all(
      ['src/api/routes/sendMessage.router.ts', 'src/api/controllers/sendMessage.controller.ts'].map((file) =>
        readFile(resolve(file), 'utf8'),
      ),
    );

    assert.doesNotMatch(files.join('\n'), /newsletter/i);
  });
});
