import type { HttpRequest } from '@azure/functions';
import { env } from '../config/env';

interface MarketScanHttpBody {
  tickers?: string[] | string;
  timeframe?: string;
  limit?: number | string;
  notify?: boolean | string;
  capital?: number | string;
  tradingCapital?: number | string;
  opportunityMinScore?: number | string;
  telegramNotificationMinScore?: number | string;
  OPPORTUNITY_MIN_SCORE?: number | string;
  TELEGRAM_NOTIFICATION_MIN_SCORE?: number | string;
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

export const parseCapital = (value: number | string | null | undefined): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
};

export const parseScoreThreshold = (
  value: number | string | null | undefined,
): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  return undefined;
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
      capital: params.get('capital') ?? undefined,
      tradingCapital: params.get('tradingCapital') ?? undefined,
      opportunityMinScore: params.get('opportunityMinScore') ?? undefined,
      telegramNotificationMinScore: params.get('telegramNotificationMinScore') ?? undefined,
      OPPORTUNITY_MIN_SCORE: params.get('OPPORTUNITY_MIN_SCORE') ?? undefined,
      TELEGRAM_NOTIFICATION_MIN_SCORE: params.get('TELEGRAM_NOTIFICATION_MIN_SCORE') ?? undefined,
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
