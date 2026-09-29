import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import { NewsletterService, normalizeNewsletterError } from '../src/api/services/newsletter.service';

const INSTANCE_NAME = 'Canais CPG';
const NEWSLETTER_JID = '120363429376422315@newsletter';

describe('NewsletterService', () => {
  const generatedPreview = {
    'canonical-url': 'https://example.com/article',
    'matched-text': 'https://example.com/article',
    jpegThumbnail: Buffer.from('jpeg-thumbnail'),
    originalThumbnailUrl: 'https://example.com/image.jpg',
    title: 'Article title',
  };

  let sendMessage: ReturnType<typeof mock.fn>;
  let resolveLinkPreview: ReturnType<typeof mock.fn>;
  let instance: Record<string, any>;
  let service: NewsletterService;

  beforeEach(() => {
    sendMessage = mock.fn(async () => ({ key: { id: 'message-id' } }));
    resolveLinkPreview = mock.fn(async () => generatedPreview);
    instance = {
      integration: 'WHATSAPP-BAILEYS',
      connectionStatus: { state: 'open' },
      client: { sendMessage },
    };
    service = new NewsletterService(
      { waInstances: { [INSTANCE_NAME]: instance } } as any,
      resolveLinkPreview as any,
    );
  });

  it('publishes the Open Graph image with the original text as its caption by default', async () => {
    const text = 'Publication https://example.com/article';
    const response = await service.sendText(INSTANCE_NAME, { jid: NEWSLETTER_JID, text });

    const [resolvedText, options] = resolveLinkPreview.mock.calls[0].arguments;
    assert.equal(resolvedText, 'https://example.com/article');
    assert.deepEqual(
      { fetchOpts: options.fetchOpts, thumbnailWidth: options.thumbnailWidth },
      {
        fetchOpts: {
          timeout: 5_000,
          headers: {
            Accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          },
        },
        thumbnailWidth: 192,
      },
    );
    assert.deepEqual(sendMessage.mock.calls[0].arguments, [
      NEWSLETTER_JID,
      {
        image: { url: 'https://example.com/image.jpg' },
        caption: text,
        jpegThumbnail: Buffer.from('jpeg-thumbnail').toString('base64'),
      },
    ]);
    assert.deepEqual(response, {
      status: 'success',
      jid: NEWSLETTER_JID,
      messageId: 'message-id',
      linkPreviewGenerated: true,
    });
  });

  it('can disable link previews explicitly', async () => {
    await service.sendText(INSTANCE_NAME, {
      jid: NEWSLETTER_JID,
      text: 'Publication https://example.com/article',
      linkPreview: false,
    });

    assert.equal(resolveLinkPreview.mock.callCount(), 0);
    assert.deepEqual(sendMessage.mock.calls[0].arguments, [
      NEWSLETTER_JID,
      { text: 'Publication https://example.com/article', linkPreview: null },
    ]);
  });

  it('falls back to plain text when no JPEG thumbnail can be generated', async () => {
    resolveLinkPreview.mock.mockImplementationOnce(async () => ({
      ...generatedPreview,
      jpegThumbnail: undefined,
    }));

    await service.sendText(INSTANCE_NAME, {
      jid: NEWSLETTER_JID,
      text: 'Publication https://example.com/article',
    });

    assert.deepEqual(sendMessage.mock.calls[0].arguments, [
      NEWSLETTER_JID,
      { text: 'Publication https://example.com/article', linkPreview: null },
    ]);
  });

  it('falls back to plain text when the preview does not contain an original image URL', async () => {
    resolveLinkPreview.mock.mockImplementationOnce(async () => ({
      ...generatedPreview,
      originalThumbnailUrl: undefined,
    }));

    await service.sendText(INSTANCE_NAME, {
      jid: NEWSLETTER_JID,
      text: 'Publication https://example.com/article',
    });

    assert.deepEqual(sendMessage.mock.calls[0].arguments, [
      NEWSLETTER_JID,
      { text: 'Publication https://example.com/article', linkPreview: null },
    ]);
  });

  it('falls back to plain text when image publishing fails', async () => {
    sendMessage.mock.mockImplementationOnce(async () => {
      throw new Error('Newsletter image upload failed');
    });

    const response = await service.sendText(INSTANCE_NAME, {
      jid: NEWSLETTER_JID,
      text: 'Publication https://example.com/article',
    });

    assert.equal(sendMessage.mock.callCount(), 2);
    assert.deepEqual(sendMessage.mock.calls[1].arguments, [
      NEWSLETTER_JID,
      { text: 'Publication https://example.com/article', linkPreview: null },
    ]);
    assert.equal(response.linkPreviewGenerated, false);
  });

  it('still publishes plain text when preview generation fails', async () => {
    resolveLinkPreview.mock.mockImplementationOnce(async () => {
      throw new Error('private preview failure');
    });

    await service.sendText(INSTANCE_NAME, {
      jid: NEWSLETTER_JID,
      text: 'Publication https://example.com/article',
    });

    assert.deepEqual(sendMessage.mock.calls[0].arguments, [
      NEWSLETTER_JID,
      { text: 'Publication https://example.com/article', linkPreview: null },
    ]);
  });

  it('rejects a missing or non-newsletter JID', async () => {
    await assert.rejects(
      service.sendText(INSTANCE_NAME, { jid: undefined, text: 'Publication' }),
      (error: any) => {
        assert.equal(error.status, 400);
        assert.deepEqual(error.message, ['Invalid newsletter JID']);
        return true;
      },
    );
    await assert.rejects(service.sendText(INSTANCE_NAME, { jid: '5511999999999@s.whatsapp.net', text: 'Publication' }));
    await assert.rejects(service.sendText(INSTANCE_NAME, { jid: '120363000000000000@g.us', text: 'Publication' }));
  });

  it('rejects whitespace-only text', async () => {
    await assert.rejects(service.sendText(INSTANCE_NAME, { jid: NEWSLETTER_JID, text: '   ' }), (error: any) => {
      assert.deepEqual(error.message, ['Text is required']);
      return true;
    });
  });

  it('returns not found when the instance is absent', async () => {
    const missingInstanceService = new NewsletterService({ waInstances: {} } as any, resolveLinkPreview as any);

    await assert.rejects(
      missingInstanceService.sendText(INSTANCE_NAME, { jid: NEWSLETTER_JID, text: 'Publication' }),
      (error: any) => {
        assert.equal(error.status, 404);
        assert.deepEqual(error.message, ['Instance not found']);
        return true;
      },
    );
  });

  it('rejects disconnected instances and unavailable sockets', async () => {
    instance.connectionStatus.state = 'close';
    await assert.rejects(service.sendText(INSTANCE_NAME, { jid: NEWSLETTER_JID, text: 'Publication' }));

    instance.connectionStatus.state = 'open';
    instance.client = undefined;
    await assert.rejects(service.sendText(INSTANCE_NAME, { jid: NEWSLETTER_JID, text: 'Publication' }));
  });

  it('rejects non-Baileys instances', async () => {
    instance.integration = 'WHATSAPP-BUSINESS';
    await assert.rejects(service.sendText(INSTANCE_NAME, { jid: NEWSLETTER_JID, text: 'Publication' }));
  });

  it('normalizes errors from Baileys without exposing credentials', async () => {
    resolveLinkPreview.mock.mockImplementationOnce(async () => null);
    sendMessage.mock.mockImplementationOnce(async () => {
      throw {
        output: { payload: { message: 'Not authorized; access_token=secret-value' } },
      };
    });

    await assert.rejects(
      service.sendText(INSTANCE_NAME, { jid: NEWSLETTER_JID, text: 'Publication' }),
      (error: any) => {
        assert.equal(error.status, 400);
        assert.match(error.message[0], /Not authorized/);
        assert.doesNotMatch(error.message[0], /secret-value/);
        assert.doesNotMatch(error.message[0], /\[object Object\]/);
        return true;
      },
    );
  });
});

describe('normalizeNewsletterError', () => {
  it('uses a safe fallback for opaque errors', () => {
    assert.equal(normalizeNewsletterError({ reason: { opaque: true } }), 'Unknown Baileys error');
  });
});
