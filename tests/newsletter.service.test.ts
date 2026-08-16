import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import { NewsletterService, normalizeNewsletterError } from '../src/api/services/newsletter.service';

const INSTANCE_NAME = 'Canais CPG';
const NEWSLETTER_JID = '120363429376422315@newsletter';

describe('NewsletterService', () => {
  let sendMessage: ReturnType<typeof mock.fn>;
  let instance: Record<string, any>;
  let service: NewsletterService;

  beforeEach(() => {
    sendMessage = mock.fn(async () => ({ key: { id: 'message-id' } }));
    instance = {
      integration: 'WHATSAPP-BAILEYS',
      connectionStatus: { state: 'open' },
      client: { sendMessage },
    };
    service = new NewsletterService({ waInstances: { [INSTANCE_NAME]: instance } } as any);
  });

  it('forwards the exact JID and text to the existing Baileys socket', async () => {
    const response = await service.sendText(INSTANCE_NAME, { jid: NEWSLETTER_JID, text: 'Publication' });

    assert.deepEqual(sendMessage.mock.calls[0].arguments, [NEWSLETTER_JID, { text: 'Publication' }]);
    assert.deepEqual(response, { status: 'success', jid: NEWSLETTER_JID, messageId: 'message-id' });
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
    const missingInstanceService = new NewsletterService({ waInstances: {} } as any);

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
