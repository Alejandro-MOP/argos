const run = jest.fn().mockResolvedValue({ ok: true });

jest.mock('../src/config/container', () => ({
  marketScanExecutor: { run },
}));

jest.mock('../src/config/env', () => ({
  env: {
    marketScanSchedule: '0 */15 14-21 * * 1-5',
    marketScanTimeframes: ['1m', '5m', '15m', '1d', '1w'],
    marketScanCandleLimit: 80,
  },
}));

describe('marketScan timer function', () => {
  it('delegates scan matrix resolution to dynamic configuration and market universe', async () => {
    const { marketScan } = await import('../src/functions/marketScan');
    const context = { log: jest.fn(), error: jest.fn() };

    await marketScan({} as never, context as never);

    expect(run).toHaveBeenCalledWith(
      {
        notify: true,
      },
      context,
    );
  });
});

export {};
