const find = jest.fn();

jest.mock('../src/config/container', () => ({
  orbFvgSignalRepository: { find },
}));

const buildRequest = (queryValues: Record<string, string | null>) => ({
  query: {
    get: jest.fn((key: string) => queryValues[key] ?? null),
  },
});

describe('orbFvgSignals HTTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    find.mockResolvedValue([]);
  });

  it('queries ORB-FVG signals as read-only with filters', async () => {
    const { orbFvgSignals } = await import('../src/functions/orbFvgSignals');

    const response = await orbFvgSignals(buildRequest({
      sessionDate: '2026-09-07',
      ticker: 'NVDA',
      assetType: 'STOCK',
      direction: 'LONG',
      status: 'OPEN',
      limit: '25',
    }) as never);

    expect(find).toHaveBeenCalledWith({
      sessionDate: '2026-09-07',
      ticker: 'NVDA',
      assetType: 'STOCK',
      direction: 'LONG',
      status: 'OPEN',
      experimentVersion: 'orb-fvg-v0.1',
      limit: 25,
    });
    expect(response).toEqual({ status: 200, jsonBody: { ok: true, count: 0, signals: [] } });
  });
});

export {};

