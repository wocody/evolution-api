import { SendNewsletterTextDto } from '@api/dto/newsletter.dto';
import type { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { Logger } from '@config/logger.config';
import { BadRequestException, NotFoundException } from '@exceptions';
import { LINK_PREVIEW_FETCH_HEADERS } from '@utils/link-preview.util';
import { extractUrlFromText, getUrlInfo, WAUrlInfo } from 'baileys';

const UNKNOWN_BAILEYS_ERROR = 'Unknown Baileys error';
const MAX_ERROR_MESSAGE_LENGTH = 500;
const LINK_PREVIEW_THUMBNAIL_WIDTH = 192;
const LINK_PREVIEW_TIMEOUT_MS = 5_000;

type LinkPreviewResolver = typeof getUrlInfo;

const readErrorValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const message = value.trim();
    return message && message !== '[object Object]' ? message : undefined;
  }

  if (Array.isArray(value)) {
    const messages = value.map(readErrorValue).filter(Boolean);
    return messages.length > 0 ? messages.join('; ') : undefined;
  }

  return undefined;
};

const getNestedValue = (value: unknown, path: string[]): unknown => {
  return path.reduce<unknown>((current, property) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[property];
  }, value);
};

export const normalizeNewsletterError = (error: unknown): string => {
  const candidatePaths = [
    ['output', 'payload', 'message'],
    ['response', 'data', 'message'],
    ['data', 'message'],
    ['message'],
    ['output', 'payload', 'error'],
    ['error'],
  ];

  let message = readErrorValue(error);

  for (const path of candidatePaths) {
    message ??= readErrorValue(getNestedValue(error, path));
  }

  message ??= UNKNOWN_BAILEYS_ERROR;

  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credential|session[_-]?(?:key|token))(["'\s:=]+)([^,\s}"']+)/gi,
      '$1$2[REDACTED]',
    )
    .replace(/\b[A-Za-z0-9+/_=-]{64,}\b/g, '[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
};

export class NewsletterService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly resolveLinkPreview: LinkPreviewResolver = getUrlInfo,
  ) {}

  private readonly logger = new Logger('NewsletterService');

  private async generateLinkPreview(text: string): Promise<WAUrlInfo | null> {
    const url = extractUrlFromText(text);

    if (!url) {
      return null;
    }

    try {
      const preview = await this.resolveLinkPreview(url, {
        thumbnailWidth: LINK_PREVIEW_THUMBNAIL_WIDTH,
        fetchOpts: {
          timeout: LINK_PREVIEW_TIMEOUT_MS,
          headers: LINK_PREVIEW_FETCH_HEADERS,
        },
      });

      if (!preview?.originalThumbnailUrl || !preview.jpegThumbnail?.length) {
        this.logger.warn('newsletter.linkPreview could not resolve a usable image');
        return null;
      }

      return preview;
    } catch {
      this.logger.warn('newsletter.linkPreview generation failed');
      return null;
    }
  }

  public async sendText(instanceName: string, data: SendNewsletterTextDto) {
    if (typeof data?.jid !== 'string' || !data.jid.endsWith('@newsletter')) {
      throw new BadRequestException('Invalid newsletter JID');
    }

    if (typeof data?.text !== 'string' || data.text.trim().length === 0) {
      throw new BadRequestException('Text is required');
    }

    const instance = this.waMonitor.waInstances[instanceName];

    if (!instance) {
      throw new NotFoundException('Instance not found');
    }

    if (instance.integration !== Integration.WHATSAPP_BAILEYS) {
      throw new BadRequestException('Newsletter publishing requires a WHATSAPP-BAILEYS instance');
    }

    if (instance.connectionStatus?.state !== 'open') {
      throw new BadRequestException(`The "${instanceName}" instance is not connected`);
    }

    if (!instance.client || typeof instance.client.sendMessage !== 'function') {
      throw new BadRequestException('Baileys socket is not available');
    }

    this.logger.setInstance(instanceName);
    this.logger.verbose(`newsletter.sendText to ${data.jid}`);

    try {
      const linkPreview = data.linkPreview === false ? null : await this.generateLinkPreview(data.text);
      let result;
      let linkPreviewGenerated = false;

      if (linkPreview) {
        try {
          result = await instance.client.sendMessage(data.jid, {
            image: { url: linkPreview.originalThumbnailUrl },
            caption: data.text,
            jpegThumbnail: linkPreview.jpegThumbnail.toString('base64'),
          });
          linkPreviewGenerated = true;
        } catch {
          this.logger.warn('newsletter.linkPreview image publishing failed; falling back to plain text');
        }
      }

      if (!linkPreviewGenerated) {
        result = await instance.client.sendMessage(data.jid, { text: data.text, linkPreview: null });
      }
      const messageId = result?.key?.id;

      this.logger.info(`newsletter.sendText sent to ${data.jid}${messageId ? ` (${messageId})` : ''}`);

      return {
        status: 'success',
        jid: data.jid,
        messageId: messageId ?? null,
        linkPreviewGenerated,
      };
    } catch (error) {
      const message = normalizeNewsletterError(error);
      this.logger.error(`newsletter.sendText failed for ${data.jid}: ${message}`);
      throw new BadRequestException(message);
    }
  }
}
