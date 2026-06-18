import axios, { type AxiosInstance } from 'axios';
import type { Candle } from '../models/Candle';
import type { MarketDataProvider } from '../ports/MarketDataProvider';

interface PolygonAggregate {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface PolygonAggregatesResponse {
  results?: PolygonAggregate[];
  status?: string;
  error?: string;
  message?: string;
}

interface PolygonTimeframe {
  multiplier: number;
  timespan: 'minute' | 'hour' | 'day' | 'week' | 'month';
  milliseconds: number;
}

export class PolygonClient implements MarketDataProvider {
  private readonly httpClient: AxiosInstance;

  public constructor(
    private readonly apiKey: string,
    httpClient?: AxiosInstance,
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
    const response = await this.httpClient.get<PolygonAggregatesResponse>(
      `/v2/aggs/ticker/${ticker.toUpperCase()}/range/${parsedTimeframe.multiplier}/${parsedTimeframe.timespan}/${this.formatDate(
        from,
      )}/${this.formatDate(to)}`,
      {
        params: {
          adjusted: true,
          sort: 'desc',
          limit: normalizedLimit,
          apiKey: this.apiKey,
        },
      },
    );

    if (response.data.error || response.data.status === 'ERROR') {
      throw new Error(response.data.error ?? response.data.message ?? 'Polygon API request failed');
    }

    const results = response.data.results ?? [];

    if (results.length === 0) {
      throw new Error(`Polygon returned no candles for ${ticker.toUpperCase()} ${timeframe}`);
    }

    return results
      .slice(0, normalizedLimit)
      .reverse()
      .map((aggregate) => ({
        timestamp: new Date(aggregate.t),
        open: aggregate.o,
        high: aggregate.h,
        low: aggregate.l,
        close: aggregate.c,
        volume: aggregate.v,
      }));
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
    const calendarBuffer = timeframe.timespan === 'minute' || timeframe.timespan === 'hour' ? 8 : 3;
    const rangeMilliseconds = timeframe.milliseconds * limit * calendarBuffer;

    return new Date(to.getTime() - rangeMilliseconds);
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
