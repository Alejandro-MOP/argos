import YahooFinance from 'yahoo-finance2';
import {
  InsufficientCandlesError,
  MarketDataProviderError,
  MarketDataRateLimitError,
} from '../errors/MarketDataErrors';
import type { Candle } from '../models/Candle';
import type { MarketDataProvider } from '../ports/MarketDataProvider';
import { InsufficientHistoricalDataError } from '../backtesting/BacktestEngine';

const MINIMUM_PROVIDER_CANDLES = 60;
const DAY_IN_MILLISECONDS = 86_400_000;
const YAHOO_CHART_ENDPOINT = 'yahooFinance.chart';

type YahooChartInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1wk';

interface YahooChartOptions {
  period1: Date;
  period2: Date;
  interval: YahooChartInterval;
  includePrePost: boolean;
  return: 'array';
}

export interface YahooFinanceChartQuote {
  date: Date;
  high: number | null;
  low: number | null;
  open: number | null;
  close: number | null;
  volume: number | null;
}

interface YahooChartResult {
  quotes: YahooFinanceChartQuote[];
}

interface YahooFinanceChartClient {
  chart(symbol: string, queryOptions: YahooChartOptions): Promise<YahooChartResult>;
}

interface YahooTimeframe {
  interval: YahooChartInterval;
  milliseconds: number;
}

export interface YahooFinanceRequestDebug {
  provider: 'yahoo';
  ticker: string;
  timeframe: string;
  endpoint: string;
  requestedFrom: string;
  requestedTo: string;
  candlesReturned: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

export const parseYahooTimeframe = (timeframe: string): YahooTimeframe => {
  const normalized = timeframe.trim().toLowerCase();

  switch (normalized) {
    case '1m':
      return { interval: '1m', milliseconds: 60_000 };
    case '5m':
      return { interval: '5m', milliseconds: 5 * 60_000 };
    case '15m':
      return { interval: '15m', milliseconds: 15 * 60_000 };
    case '30m':
      return { interval: '30m', milliseconds: 30 * 60_000 };
    case '1h':
      return { interval: '1h', milliseconds: 60 * 60_000 };
    case '1d':
      return { interval: '1d', milliseconds: DAY_IN_MILLISECONDS };
    case '1w':
      return { interval: '1wk', milliseconds: 7 * DAY_IN_MILLISECONDS };
    default:
      throw new Error(
        `Unsupported Yahoo Finance timeframe: ${timeframe}. Supported: 1m, 5m, 15m, 30m, 1h, 1d, 1w. Yahoo Finance chart does not support 4h directly.`,
      );
  }
};

export const mapYahooQuoteToCandle = (quote: YahooFinanceChartQuote): Candle | null => {
  const timestamp = quote.date;
  const open = quote.open;
  const high = quote.high;
  const low = quote.low;
  const close = quote.close;
  const volume = quote.volume;

  if (
    !(timestamp instanceof Date) ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    volume === null
  ) {
    return null;
  }

  if (
    !Number.isFinite(timestamp.getTime()) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    !Number.isFinite(volume)
  ) {
    return null;
  }

  if (timestamp.getTime() <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume <= 0) {
    return null;
  }

  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    return null;
  }

  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
  };
};

export class YahooFinanceClient implements MarketDataProvider {
  private readonly yahooFinance: YahooFinanceChartClient;

  public constructor(yahooFinance?: YahooFinanceChartClient, private readonly debug = false) {
    this.yahooFinance = yahooFinance ?? (new YahooFinance() as YahooFinanceChartClient);
  }

  public async getCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]> {
    const parsedTimeframe = parseYahooTimeframe(timeframe);
    const normalizedLimit = Math.max(limit, 1);
    const requestedTo = new Date();
    const requestedFrom = this.calculateFromDate(requestedTo, parsedTimeframe, normalizedLimit);
    const normalizedTicker = ticker.toUpperCase();

    try {
      const response = await this.yahooFinance.chart(normalizedTicker, {
        period1: requestedFrom,
        period2: requestedTo,
        interval: parsedTimeframe.interval,
        includePrePost: false,
        return: 'array',
      });
      const candles = response.quotes
        .map(mapYahooQuoteToCandle)
        .filter((candle): candle is Candle => candle !== null)
        .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
        .slice(-normalizedLimit);

      this.logDebug({
        provider: 'yahoo',
        ticker: normalizedTicker,
        timeframe,
        endpoint: YAHOO_CHART_ENDPOINT,
        requestedFrom: requestedFrom.toISOString(),
        requestedTo: requestedTo.toISOString(),
        candlesReturned: candles.length,
        firstTimestamp: candles.at(0)?.timestamp.toISOString() ?? 'n/a',
        lastTimestamp: candles.at(-1)?.timestamp.toISOString() ?? 'n/a',
      });

      if (candles.length < MINIMUM_PROVIDER_CANDLES) {
        throw new InsufficientCandlesError(
          normalizedTicker,
          candles.length,
          requestedFrom.toISOString(),
          requestedTo.toISOString(),
        );
      }

      return candles;
    } catch (error) {
      if (error instanceof InsufficientCandlesError) {
        throw error;
      }

      if (this.isRateLimitError(error)) {
        throw new MarketDataRateLimitError('yahoo', 429, YAHOO_CHART_ENDPOINT);
      }

      throw new MarketDataProviderError({
        provider: 'yahoo',
        endpoint: YAHOO_CHART_ENDPOINT,
        ticker: normalizedTicker,
        status: this.getErrorStatus(error),
        message: error instanceof Error ? error.message : 'Yahoo Finance request failed',
      });
    }
  }


  public async getHistoricalCandles(
    ticker: string,
    timeframe: string,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    const parsedTimeframe = parseYahooTimeframe(timeframe);
    const normalizedTicker = ticker.toUpperCase();

    try {
      const response = await this.yahooFinance.chart(normalizedTicker, {
        period1: from,
        period2: to,
        interval: parsedTimeframe.interval,
        includePrePost: false,
        return: 'array',
      });
      const candles = response.quotes
        .map(mapYahooQuoteToCandle)
        .filter((candle): candle is Candle => candle !== null)
        .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

      this.logDebug({
        provider: 'yahoo',
        ticker: normalizedTicker,
        timeframe,
        endpoint: YAHOO_CHART_ENDPOINT,
        requestedFrom: from.toISOString(),
        requestedTo: to.toISOString(),
        candlesReturned: candles.length,
        firstTimestamp: candles.at(0)?.timestamp.toISOString() ?? 'n/a',
        lastTimestamp: candles.at(-1)?.timestamp.toISOString() ?? 'n/a',
      });

      if (candles.length < MINIMUM_PROVIDER_CANDLES) {
        throw new InsufficientHistoricalDataError(
          normalizedTicker,
          timeframe,
          from.toISOString(),
          to.toISOString(),
          candles.length,
        );
      }

      return candles;
    } catch (error) {
      if (error instanceof InsufficientHistoricalDataError) {
        throw error;
      }

      if (this.isRateLimitError(error)) {
        throw new MarketDataRateLimitError('yahoo', 429, YAHOO_CHART_ENDPOINT);
      }

      throw new MarketDataProviderError({
        provider: 'yahoo',
        endpoint: YAHOO_CHART_ENDPOINT,
        ticker: normalizedTicker,
        status: this.getErrorStatus(error),
        message: error instanceof Error ? error.message : 'Yahoo Finance historical request failed',
      });
    }
  }

  private calculateFromDate(to: Date, timeframe: YahooTimeframe, limit: number): Date {
    const minimumDays = this.getMinimumCalendarDays(timeframe);
    const calendarBuffer = this.isIntradayTimeframe(timeframe) ? 8 : 3;
    const rangeMilliseconds = Math.max(
      timeframe.milliseconds * limit * calendarBuffer,
      minimumDays * DAY_IN_MILLISECONDS,
    );

    return new Date(to.getTime() - rangeMilliseconds);
  }

  private getMinimumCalendarDays(timeframe: YahooTimeframe): number {
    if (timeframe.interval === '1m') {
      return 5;
    }

    if (timeframe.interval === '5m') {
      return 7;
    }

    if (timeframe.interval === '15m') {
      return 10;
    }

    if (timeframe.interval === '30m' || timeframe.interval === '1h') {
      return 20;
    }

    return 0;
  }

  private isIntradayTimeframe(timeframe: YahooTimeframe): boolean {
    return ['1m', '5m', '15m', '30m', '1h'].includes(timeframe.interval);
  }

  private isRateLimitError(error: unknown): boolean {
    return this.getErrorStatus(error) === 429 || this.getErrorMessage(error).includes('429');
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const record = error as Record<string, unknown>;
    const status = record.status ?? record.statusCode ?? record.code;

    return typeof status === 'number' ? status : undefined;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '';
  }

  private logDebug(debugInfo: YahooFinanceRequestDebug): void {
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
