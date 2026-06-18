import type { AxiosInstance } from 'axios';
import { PolygonClient } from '../src/clients/PolygonClient';

const buildHttpClient = (response: unknown): AxiosInstance => {
  return {
    get: jest.fn().mockResolvedValue({ data: response }),
  } as unknown as AxiosInstance;
};

describe('PolygonClient', () => {
  it('fetches real candles from Polygon aggregates', async () => {
    const httpClient = buildHttpClient({
      results: [
        { t: 1_700_000_060_000, o: 101, h: 104, l: 100, c: 103, v: 1_500_000 },
        { t: 1_700_000_000_000, o: 100, h: 102, l: 99, c: 101, v: 1_000_000 },
      ],
    });
    const client = new PolygonClient('test-api-key', httpClient);

    const candles = await client.getCandles('spy', '15m', 2);

    expect(httpClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/v2/aggs/ticker/SPY/range/15/minute/'),
      expect.objectContaining({
        params: expect.objectContaining({
          adjusted: true,
          apiKey: 'test-api-key',
          limit: 2,
          sort: 'desc',
        }),
      }),
    );
    expect(candles).toEqual([
      {
        timestamp: new Date(1_700_000_000_000),
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 1_000_000,
      },
      {
        timestamp: new Date(1_700_000_060_000),
        open: 101,
        high: 104,
        low: 100,
        close: 103,
        volume: 1_500_000,
      },
    ]);
  });

  it('requires an API key instead of falling back to mocked candles', async () => {
    const client = new PolygonClient('', buildHttpClient({ results: [] }));

    await expect(client.getCandles('SPY', '15m', 2)).rejects.toThrow(
      'POLYGON_API_KEY is required to fetch real market data',
    );
  });
});
