import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { newsletterTextMessageSchema } from '../src/validate/newsletter.schema';
import { validate } from 'jsonschema';

describe('newsletterTextMessageSchema', () => {
  const isValid = (payload: unknown) => validate(payload, newsletterTextMessageSchema).valid;

  it('accepts a complete newsletter JID and non-empty text', () => {
    assert.equal(isValid({ jid: '120363429376422315@newsletter', text: 'Publication' }), true);
  });

  it('rejects a missing JID', () => {
    assert.equal(isValid({ text: 'Publication' }), false);
  });

  it('rejects contact, group, and malformed JIDs', () => {
    assert.equal(isValid({ jid: '5511999999999@s.whatsapp.net', text: 'Publication' }), false);
    assert.equal(isValid({ jid: '120363000000000000@g.us', text: 'Publication' }), false);
    assert.equal(isValid({ jid: '120363000000000000', text: 'Publication' }), false);
  });

  it('rejects missing or empty text', () => {
    assert.equal(isValid({ jid: '120363429376422315@newsletter' }), false);
    assert.equal(isValid({ jid: '120363429376422315@newsletter', text: '' }), false);
  });
});
