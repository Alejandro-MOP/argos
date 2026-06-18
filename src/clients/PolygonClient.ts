import axios, { type AxiosInstance } from 'axios';
import type { Candle } from '../models/Candle';
import type { MarketDataProvider } from '../ports/MarketDataProvider';
import { sanitizeError, type SanitizedProviderError } from '../utils/sanitizeError';

const POLYGON_API_LIMIT = 5_000;
const MINIMUM_PROVIDER_CANDLES = 60;
const DAY_IN_MILLISECONDS = 86_400_000;

interface PolygonAggregatesResponse {
  results?: unknown[];
  status?: string;
  error?: string;
  message?: string;
}

interface PolygonTimeframe {
  multiplier: number;
  timespan: 'minute' | 'hour' | 'day' | 'week' | 'month';
  milliseconds: number;
}

export interface PolygonRequestDebug {
  ticker: string;
  timeframe: string;
  endpoint: string;
  requestedFrom: string;
  requestedTo: string;
  rawResultsCount: number;
  returnedCandlesCount: number;
  firstReturnedTimestamp: string;
  lastReturnedTimestamp: string;
  firstClose: number | string;
  lastClose: number | string;
}

export class InsufficientCandlesError extends Error {
  public constructor(
    public readonly ticker: string,
    public readonly candlesCount: number,
    public readonly requestedFrom: string,
    public readonly requestedTo: string,
  ) {
    super('insufficient-candles');
  }
}

export class MarketDataRateLimitError extends Error {
  public constructor(
    public readonly provider: string,
    public readonly status: number,
    public readonly endpoint?: string,
    public readonly requestId?: string,
    public readonly statusText?: string,
  ) {
    super('rate-limit-exceeded');
  }
}

export class MarketDataProviderError extends Error {
  public constructor(public readonly details: SanitizedProviderError) {
    super(details.message);
  }
}

export const mapPolygonAggregateToCandle = (aggregate: unknown): Candle | null => {
  if (!aggregate || typeof aggregate !== 'object') {
    return null;
  }

  const rawAggregate = aggregate as Record<string, unknown>;
  const timestamp = Number(rawAggregate.t);
  const open = Number(rawAggregate.o);
  const high = Number(rawAggregate.h);
  const low = Number(rawAggregate.l);
  const close = Number(rawAggregate.c);
  const volume = Number(rawAggregate.v);

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
    timestamp: new Date(timestamp),
    open,
    high,
    low,
    close,
    volume,
  };
};

export class PolygonClient implements MarketDataProvider {
  private readonly httpClient: AxiosInstance;

  public constructor(
    private readonly apiKey: string,
    httpClient?: AxiosInstance,
    private readonly debug = false,
  ) {
    this.httpClient =
      httpClient ??
      axios.create({
        baseURL: 'https://api.polygon.io',
        timeout: 10_000,
      });
  }

  public async getCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]> {
    if (!this.apiKey) {
      throw new Error('POLYGON_API_KEY is required to fetch real market data');
    }

    const parsedTimeframe = this.parseTimeframe(timeframe);
    const normalizedLimit = Math.max(limit, 1);
    const to = new Date();
    const from = this.calculateFromDate(to, parsedTimeframe, normalizedLimit);
    const requestedFrom = this.formatDate(from);
    const requestedTo = this.formatDate(to);
    const endpoint = `/v2/aggs/ticker/${ticker.toUpperCase()}/range/${parsedTimeframe.multiplier}/${parsedTimeframe.timespan}/${requestedFrom}/${requestedTo}`;
    const response = await this.fetchAggregates(endpoint, ticker.toUpperCase());

    if (response.data.error || response.data.status === 'ERROR') {
      throw new Error(response.data.error ?? response.data.message ?? 'Polygon API request failed');
    }

    const results = response.data.results ?? [];
    const candles = results
      .map(mapPolygonAggregateToCandle)
      .filter((candle): candle is Candle => candle !== null)
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
      .slice(-normalizedLimit);

    this.logDebug({
      ticker: ticker.toUpperCase(),
      timeframe,
      endpoint,
      requestedFrom,
      requestedTo,
      rawResultsCount: results.length,
      returnedCandlesCount: candles.length,
      firstReturnedTimestamp: candles.at(0)?.timestamp.toISOString() ?? 'n/a',
      lastReturnedTimestamp: candles.at(-1)?.timestamp.toISOString() ?? 'n/a',
      firstClose: candles.at(0)?.close ?? 'n/a',
      lastClose: candles.at(-1)?.close ?? 'n/a',
    });

    if (candles.length < MINIMUM_PROVIDER_CANDLES) {
      throw new InsufficientCandlesError(
        ticker.toUpperCase(),
        candles.length,
        requestedFrom,
        requestedTo,
      );
    }

    return candles;
  }

  private parseTimeframe(timeframe: string): PolygonTimeframe {
    const normalized = timeframe.trim().toLowerCase();
    const match = normalized.match(
      /^(\d+)\s*(m|min|minute|minutes|h|hour|hours|d|day|days|w|week|weeks|mo|month|months)$/,
    );

    if (!match) {
      throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    const multiplier = Number.parseInt(match[1], 10);
    const unit = match[2];

    if (unit === 'm' || unit === 'min' || unit === 'minute' || unit === 'minutes') {
      return { multiplier, timespan: 'minute', milliseconds: multiplier * 60_000 };
    }

    if (unit === 'h' || unit === 'hour' || unit === 'hours') {
      return { multiplier, timespan: 'hour', milliseconds: multiplier * 3_600_000 };
    }

    if (unit === 'd' || unit === 'day' || unit === 'days') {
      return { multiplier, timespan: 'day', milliseconds: multiplier * 86_400_000 };
    }

    if (unit === 'w' || unit === 'week' || unit === 'weeks') {
      return { multiplier, timespan: 'week', milliseconds: multiplier * 7 * 86_400_000 };
    }

    return { multiplier, timespan: 'month', milliseconds: multiplier * 31 * 86_400_000 };
  }

  private calculateFromDate(to: Date, timeframe: PolygonTimeframe, limit: number): Date {
    const minimumDays = this.getMinimumCalendarDays(timeframe);
    const calendarBuffer = timeframe.timespan === 'minute' || timeframe.timespan === 'hour' ? 8 : 3;
    const rangeMilliseconds = Math.max(
      timeframe.milliseconds * limit * calendarBuffer,
      minimumDays * DAY_IN_MILLISECONDS,
    );

    return new Date(to.getTime() - rangeMilliseconds);
  }

  private getMinimumCalendarDays(timeframe: PolygonTimeframe): number {
    if (timeframe.timespan === 'minute') {
      if (timeframe.multiplier === 1) {
        return 5;
      }

      if (timeframe.multiplier === 5) {
        return 7;
      }

      if (timeframe.multiplier === 15) {
        return 10;
      }

      if (timeframe.multiplier === 30) {
        return 20;
      }
    }

    if (timeframe.timespan === 'hour') {
      return 20;
    }

    return 0;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private async fetchAggregates(
    endpoint: string,
    ticker: string,
  ): Promise<{ data: PolygonAggregatesResponse }> {
    try {
      return await this.httpClient.get<PolygonAggregatesResponse>(endpoint, {
        params: {
          adjusted: true,
          sort: 'asc',
          limit: POLYGON_API_LIMIT,
          apiKey: this.apiKey,
        },
      });
    } catch (error) {
      const sanitizedError = sanitizeError(error, {
        provider: 'polygon',
        endpoint,
        ticker,
      });

      if (sanitizedError.status === 429) {
        throw new MarketDataRateLimitError(
          'polygon',
          429,
          sanitizedError.endpoint,
          sanitizedError.requestId,
          sanitizedError.statusText,
        );
      }

      throw new MarketDataProviderError(sanitizedError);
    }
  }

  private logDebug(debugInfo: PolygonRequestDebug): void {
    if (!this.debug) {
      return;
    }

    console.log(
      [
        'Polygon debug',
        `ticker=${debugInfo.ticker}`,
        `timeframe=${debugInfo.timeframe}`,
        `endpoint=${debugInfo.endpoint}`,
        `requestedFrom=${debugInfo.requestedFrom}`,
        `requestedTo=${debugInfo.requestedTo}`,
        `rawResultsCount=${debugInfo.rawResultsCount}`,
        `returnedCandlesCount=${debugInfo.returnedCandlesCount}`,
        `firstReturnedTimestamp=${debugInfo.firstReturnedTimestamp}`,
        `lastReturnedTimestamp=${debugInfo.lastReturnedTimestamp}`,
        `firstClose=${debugInfo.firstClose}`,
        `lastClose=${debugInfo.lastClose}`,
      ].join(' '),
    );
  }
}
