import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';

import { getWAUploadToServer, prepareWAMessageMedia } from 'baileys';

describe('Baileys Newsletter media patch', () => {
  it('uses the dedicated Newsletter CDN path and accepts direct-path-only responses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'newsletter-image-'));
    const filePath = join(directory, 'image.jpg');
    const originalFetch = globalThis.fetch;
    const fetchMock = mock.fn(async () =>
      new Response(
        JSON.stringify({
          direct_path: '/newsletter/image',
          thumbnail_info: {
            thumbnail_direct_path: '/newsletter/thumbnail',
            thumbnail_sha256: Buffer.from('thumbnail-sha256').toString('base64'),
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      ),
    );

    await writeFile(filePath, Buffer.from('image'));
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

      const result = await (upload as any)(filePath, {
        fileEncSha256B64: 'image-sha256',
        mediaType: 'image',
        newsletter: true,
        timeoutMs: 5_000,
      });

      const requestUrl = new URL(fetchMock.mock.calls[0].arguments[0] as string);
      assert.equal(requestUrl.pathname, '/newsletter/newsletter-image/image-sha256');
      assert.equal(requestUrl.searchParams.get('server_thumb_gen'), '1');
      assert.deepEqual(result, {
        directPath: '/newsletter/image',
        fbid: undefined,
        mediaUrl: '/newsletter/image',
        meta_hmac: undefined,
        thumbnailDirectPath: '/newsletter/thumbnail',
        thumbnailSha256: Buffer.from('thumbnail-sha256').toString('base64'),
        ts: undefined,
      });
    } finally {
      globalThis.fetch = originalFetch;
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('prepares Newsletter images with raw upload metadata and no regular media URL', async () => {
    const thumbnailSha256 = Buffer.from('thumbnail-sha256');
    const jpegThumbnail = Buffer.from('jpeg-thumbnail');
    const upload = mock.fn(async () => ({
      directPath: '/newsletter/image',
      mediaUrl: undefined,
      thumbnailDirectPath: '/newsletter/thumbnail',
      thumbnailSha256: thumbnailSha256.toString('base64'),
    }));

    const { imageMessage } = await prepareWAMessageMedia(
      {
        image: Buffer.from('image'),
        caption: 'Publication https://example.com/article',
        jpegThumbnail: jpegThumbnail.toString('base64'),
      },
      {
        jid: '120363429376422315@newsletter',
        upload: upload as any,
      } as any,
    );

    assert.equal(upload.mock.callCount(), 1);
    assert.equal(upload.mock.calls[0].arguments[1].mediaType, 'image');
    assert.equal(upload.mock.calls[0].arguments[1].newsletter, true);
    assert.equal(imageMessage?.url, null);
    assert.equal(imageMessage?.directPath, '/newsletter/image');
    assert.equal(imageMessage?.thumbnailDirectPath, '/newsletter/thumbnail');
    assert.deepEqual(Buffer.from(imageMessage?.thumbnailSha256 ?? []), thumbnailSha256);
    assert.deepEqual(Buffer.from(imageMessage?.jpegThumbnail ?? []), jpegThumbnail);
    assert.equal(imageMessage?.caption, 'Publication https://example.com/article');
  });
});
