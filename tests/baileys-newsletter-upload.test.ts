import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';

import { getWAUploadToServer } from 'baileys';

describe('Baileys Newsletter thumbnail patch', () => {
  it('uses the dedicated Newsletter CDN path for link thumbnails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'newsletter-thumbnail-'));
    const filePath = join(directory, 'thumbnail.enc');
    const originalFetch = globalThis.fetch;
    const fetchMock = mock.fn(async () =>
      new Response(JSON.stringify({ url: 'https://mmg.whatsapp.net/thumbnail', direct_path: '/m1/thumbnail' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await writeFile(filePath, Buffer.from('encrypted-thumbnail'));
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const upload = getWAUploadToServer(
        {
          customUploadHosts: [],
          logger: { debug: mock.fn(), warn: mock.fn() },
          options: {},
        } as any,
        async () => ({
          auth: 'test-auth',
          fetchDate: new Date(),
          hosts: [{ hostname: 'upload.whatsapp.test', maxContentLengthBytes: 1_000_000 }],
          ttl: 60,
        }),
      );

      await (upload as any)(filePath, {
        fileEncSha256B64: 'thumbnail-sha256',
        mediaType: 'thumbnail-link',
        newsletter: true,
        timeoutMs: 5_000,
      });

      const requestUrl = new URL(fetchMock.mock.calls[0].arguments[0] as string);
      assert.equal(requestUrl.pathname, '/newsletter/newsletter-thumbnail-link/thumbnail-sha256');
      assert.equal(requestUrl.searchParams.get('server_thumb_gen'), '1');
    } finally {
      globalThis.fetch = originalFetch;
      await rm(directory, { force: true, recursive: true });
    }
  });
});
