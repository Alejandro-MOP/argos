import axios, { type AxiosInstance } from 'axios';
import type { Candle } from '../models/Candle';
import type { MarketDataProvider } from '../ports/MarketDataProvider';

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
    void this.httpClient;
    void this.apiKey;
    void timeframe;

    return this.buildMockCandles(ticker, limit);
  }

  private buildMockCandles(ticker: string, limit: number): Candle[] {
    const normalizedLimit = Math.max(limit, 80);
    const now = Date.now();
    const basePrice = 100 + (ticker.charCodeAt(0) % 20);

    return Array.from({ length: normalizedLimit }, (_, index) => {
      const isLast = index === normalizedLimit - 1;
      const relativeIndex = normalizedLimit - index;
      const drift = index * 0.18;
      const lateConsolidation = relativeIndex <= 15 ? (index % 2 === 0 ? 0.85 : -0.85) : 0;
      const close = isLast ? basePrice + drift + 4 : basePrice + drift + lateConsolidation;
      const open = close - 0.45;
      const high = close + (isLast ? 0.2 : 0.8);
      const low = close - 1.1;
      const volume = isLast ? 2_500_000 : 1_000_000 + index * 10_000;

      return {
        timestamp: new Date(now - (normalizedLimit - index) * 60_000),
        open,
        high,
        low,
        close,
        volume,
      };
    });
  }
}
