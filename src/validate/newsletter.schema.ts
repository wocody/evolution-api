import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

export const newsletterTextMessageSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    jid: {
      type: 'string',
      pattern: '^[^\\s@]+@newsletter$',
      description: 'Invalid newsletter JID',
    },
    text: {
      type: 'string',
      minLength: 1,
      description: 'Text is required',
    },
    linkPreview: {
      type: 'boolean',
      description: 'linkPreview must be a boolean',
    },
  },
  required: ['jid', 'text'],
};
