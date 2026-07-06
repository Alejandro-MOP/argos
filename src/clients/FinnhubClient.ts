import axios, { type AxiosInstance } from 'axios';
import {
  InsufficientCandlesError,
  MarketDataProviderError,
  MarketDataRateLimitError,
} from '../errors/MarketDataErrors';
import type { Candle } from '../models/Candle';
import type { MarketDataProvider } from '../ports/MarketDataProvider';
import { sanitizeError } from '../utils/sanitizeError';

const MINIMUM_PROVIDER_CANDLES = 60;
const DAY_IN_SECONDS = 86_400;

interface FinnhubCandlesResponse {
  c?: unknown[];
  h?: unknown[];
  l?: unknown[];
  o?: unknown[];
  s?: string;
  t?: unknown[];
  v?: unknown[];
}

interface FinnhubTimeframe {
  resolution: '1' | '5' | '15' | '30' | '60' | 'D' | 'W';
  seconds: number;
}

export interface FinnhubRequestDebug {
  provider: 'finnhub';
  ticker: string;
  timeframe: string;
  endpoint: string;
  requestedFrom: string;
  requestedTo: string;
  candlesReturned: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

export const parseFinnhubTimeframe = (timeframe: string): FinnhubTimeframe => {
  const normalized = timeframe.trim().toLowerCase();

  switch (normalized) {
    case '1m':
      return { resolution: '1', seconds: 60 };
    case '5m':
      return { resolution: '5', seconds: 5 * 60 };
    case '15m':
      return { resolution: '15', seconds: 15 * 60 };
    case '30m':
      return { resolution: '30', seconds: 30 * 60 };
    case '1h':
      return { resolution: '60', seconds: 60 * 60 };
    case '1d':
      return { resolution: 'D', seconds: DAY_IN_SECONDS };
    case '1w':
      return { resolution: 'W', seconds: 7 * DAY_IN_SECONDS };
    default:
      throw new Error(
        `Unsupported Finnhub timeframe: ${timeframe}. Supported: 1m, 5m, 15m, 30m, 1h, 1d, 1w. Finnhub does not support 4h directly.`,
      );
  }
};

export const mapFinnhubResponseToCandles = (response: FinnhubCandlesResponse): Candle[] => {
  const timestamps = response.t ?? [];
  const opens = response.o ?? [];
  const highs = response.h ?? [];
  const lows = response.l ?? [];
  const closes = response.c ?? [];
  const volumes = response.v ?? [];
  const length = Math.min(
    timestamps.length,
    opens.length,
    highs.length,
    lows.length,
    closes.length,
    volumes.length,
  );
  const candles: Candle[] = [];

  for (let index = 0; index < length; index += 1) {
    const candle = mapFinnhubCandleAtIndex(response, index);

    if (candle) {
      candles.push(candle);
    }
  }

  return candles.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
};

const mapFinnhubCandleAtIndex = (
  response: FinnhubCandlesResponse,
  index: number,
): Candle | null => {
  const timestamp = Number(response.t?.[index]);
  const open = Number(response.o?.[index]);
  const high = Number(response.h?.[index]);
  const low = Number(response.l?.[index]);
  const close = Number(response.c?.[index]);
  const volume = Number(response.v?.[index]);

  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    !Number.isFinite(volume)
  ) {
    return null;
  }

  if (timestamp <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume <= 0) {
    return null;
  }

  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    return null;
  }

  return {
    timestamp: new Date(timestamp * 1000),
    open,
    high,
    low,
    close,
    volume,
  };
};

export class FinnhubClient implements MarketDataProvider {
  private readonly httpClient: AxiosInstance;

  public constructor(
    private readonly apiKey: string,
    httpClient?: AxiosInstance,
    private readonly debug = false,
  ) {
    this.httpClient =
      httpClient ??
      axios.create({
        baseURL: 'https://finnhub.io',
        timeout: 10_000,
      });
  }

  public async getCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]> {
    if (!this.apiKey) {
      throw new Error('FINNHUB_API_KEY is required to fetch real market data');
    }

    const parsedTimeframe = parseFinnhubTimeframe(timeframe);
    const normalizedLimit = Math.max(limit, 1);
    const to = Math.floor(Date.now() / 1000);
    const from = this.calculateFromTimestamp(to, parsedTimeframe, normalizedLimit);
    const endpoint = '/api/v1/stock/candle';
    const normalizedTicker = ticker.toUpperCase();
    const response = await this.fetchCandles(endpoint, normalizedTicker, parsedTimeframe, from, to);

    if (response.data.s === 'no_data') {
      throw new InsufficientCandlesError(
        normalizedTicker,
        0,
        this.formatTimestamp(from),
        this.formatTimestamp(to),
      );
    }

    if (response.data.s && response.data.s !== 'ok') {
      throw new Error(`Finnhub API request failed with status: ${response.data.s}`);
    }

    const candles = mapFinnhubResponseToCandles(response.data).slice(-normalizedLimit);

    this.logDebug({
      provider: 'finnhub',
      ticker: normalizedTicker,
      timeframe,
      endpoint,
      requestedFrom: this.formatTimestamp(from),
      requestedTo: this.formatTimestamp(to),
      candlesReturned: candles.length,
      firstTimestamp: candles.at(0)?.timestamp.toISOString() ?? 'n/a',
      lastTimestamp: candles.at(-1)?.timestamp.toISOString() ?? 'n/a',
    });

    if (candles.length < MINIMUM_PROVIDER_CANDLES) {
      throw new InsufficientCandlesError(
        normalizedTicker,
        candles.length,
        this.formatTimestamp(from),
        this.formatTimestamp(to),
      );
    }

    return candles;
  }

  private calculateFromTimestamp(to: number, timeframe: FinnhubTimeframe, limit: number): number {
    const calendarBuffer = timeframe.resolution === 'D' || timeframe.resolution === 'W' ? 3 : 8;
    const minimumSeconds = this.getMinimumCalendarDays(timeframe) * DAY_IN_SECONDS;
    const requestedSeconds = timeframe.seconds * limit * calendarBuffer;

    return to - Math.max(requestedSeconds, minimumSeconds);
  }

  private getMinimumCalendarDays(timeframe: FinnhubTimeframe): number {
    if (timeframe.resolution === '1') {
      return 5;
    }

    if (timeframe.resolution === '5') {
      return 7;
    }

    if (timeframe.resolution === '15') {
      return 10;
    }

    if (timeframe.resolution === '30') {
      return 20;
    }

    if (timeframe.resolution === '60') {
      return 20;
    }

    return 0;
  }

  private async fetchCandles(
    endpoint: string,
    ticker: string,
    timeframe: FinnhubTimeframe,
    from: number,
    to: number,
  ): Promise<{ data: FinnhubCandlesResponse }> {
    try {
      return await this.httpClient.get<FinnhubCandlesResponse>(endpoint, {
        params: {
          symbol: ticker,
          resolution: timeframe.resolution,
          from,
          to,
          token: this.apiKey,
        },
      });
    } catch (error) {
      const sanitizedError = sanitizeError(error, {
        provider: 'finnhub',
        endpoint,
        ticker,
      });

      if (sanitizedError.status === 429) {
        throw new MarketDataRateLimitError(
          'finnhub',
          429,
          sanitizedError.endpoint,
          sanitizedError.requestId,
          sanitizedError.statusText,
        );
      }

      throw new MarketDataProviderError({
        ...sanitizedError,
        message: this.formatProviderErrorMessage(sanitizedError.message, sanitizedError.status),
      });
    }
  }

  private formatProviderErrorMessage(message: string, status?: number): string {
    if (status === 401) {
      return `finnhub-unauthorized: ${message}`;
    }

    if (status === 404) {
      return `finnhub-not-found: ${message}`;
    }

    if (message.toLowerCase().includes('timeout')) {
      return `finnhub-timeout: ${message}`;
    }

    return message;
  }

  private formatTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString();
  }

  private logDebug(debugInfo: FinnhubRequestDebug): void {
    if (!this.debug) {
      return;
    }

    console.log(
      [
        'Market data debug',
        `provider=${debugInfo.provider}`,
        `ticker=${debugInfo.ticker}`,
        `timeframe=${debugInfo.timeframe}`,
        `endpoint=${debugInfo.endpoint}`,
        `requestedFrom=${debugInfo.requestedFrom}`,
        `requestedTo=${debugInfo.requestedTo}`,
        `candlesReturned=${debugInfo.candlesReturned}`,
        `firstTimestamp=${debugInfo.firstTimestamp}`,
        `lastTimestamp=${debugInfo.lastTimestamp}`,
      ].join(' '),
    );
  }
}
