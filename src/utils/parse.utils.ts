import type { HttpRequest } from '@azure/functions';
import { env } from '../config/env';

interface MarketScanHttpBody {
  tickers?: string[] | string;
  timeframe?: string;
  limit?: number | string;
  notify?: boolean | string;
  message?: string;
  Body?: string;
  text?: string;
}

export const parseTickers = (value: string[] | string | null | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean);
  }

  return value
    .split(',')
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
};

export const parseLimit = (value: number | string | null | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? env.marketScanCandleLimit : parsed;
  }

  return env.marketScanCandleLimit;
};

export const parseNotify = (value: boolean | string | null | undefined): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() !== 'false';
  }

  return true;
};

export const parseBody = async (request: HttpRequest): Promise<MarketScanHttpBody> => {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    const params = new URLSearchParams(text);

    return {
      tickers: params.get('tickers') ?? undefined,
      timeframe: params.get('timeframe') ?? undefined,
      limit: params.get('limit') ?? undefined,
      notify: params.get('notify') ?? undefined,
      message: params.get('message') ?? undefined,
      Body: params.get('Body') ?? undefined,
      text: params.get('text') ?? undefined,
    };
  }

  try {
    const body = await request.json();

    if (typeof body === 'object' && body !== null) {
      return body as MarketScanHttpBody;
    }
  } catch {
    return {};
  }

  return {};
};

export const parseWhatsAppText = (body: MarketScanHttpBody): string | undefined => {
  return body.message ?? body.Body ?? body.text;
};

export const parseTickersFromMessage = (message: string | undefined): string[] | undefined => {
  if (!message) {
    return undefined;
  }

  const normalizedMessage = message.trim();
  const match = normalizedMessage.match(/^(scan|analiza|analizar)\s+(.+)$/i);

  if (!match) {
    return undefined;
  }

  return parseTickers(match[2].replace(/\s+/g, ','));
};
