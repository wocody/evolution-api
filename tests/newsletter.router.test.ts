import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { NewsletterRouter } from '../src/api/routes/newsletter.router';
import express, { NextFunction, Request, Response } from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';

describe('NewsletterRouter', () => {
  let baseUrl: string;
  let server: Server;
  let calls = 0;

  before(async () => {
    const controller = {
      async sendText(instance: { instanceName: string }, data: { jid: string; text: string }) {
        calls += 1;
        return { status: 'success', jid: data.jid, messageId: `${instance.instanceName}-id` };
      },
    };
    const apiKeyGuard = (req: Request, res: Response, next: NextFunction) => {
      if (req.get('apikey') !== 'test-key') return res.status(401).json({ error: 'Unauthorized' });
      next();
    };
    const app = express();
    app.use(express.json());
    app.use('/newsletter', new NewsletterRouter(controller, apiKeyGuard).router);
    app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
      res.status(error.status || 500).json(error);
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it('requires the configured API key guard', async () => {
    const response = await fetch(`${baseUrl}/newsletter/sendText/Canais%20CPG`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jid: '120363429376422315@newsletter', text: 'Publication' }),
    });

    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  });

  it('validates and dispatches an authenticated request', async () => {
    const response = await fetch(`${baseUrl}/newsletter/sendText/Canais%20CPG`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: 'test-key' },
      body: JSON.stringify({ jid: '120363429376422315@newsletter', text: 'Publication' }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      status: 'success',
      jid: '120363429376422315@newsletter',
      messageId: 'Canais CPG-id',
    });
    assert.equal(calls, 1);
  });

  it('returns 400 before dispatching an invalid destination', async () => {
    const response = await fetch(`${baseUrl}/newsletter/sendText/Canais%20CPG`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: 'test-key' },
      body: JSON.stringify({ jid: '5511999999999@s.whatsapp.net', text: 'Publication' }),
    });

    assert.equal(response.status, 400);
    assert.equal(calls, 1);
  });
});
