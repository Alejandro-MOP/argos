const generate = jest.fn().mockResolvedValue({
  schemaVersion: '1',
  snapshot: {
    snapshotDate: '2026-08-28',
    generatedAt: '2026-08-28T18:00:00.000Z',
    timeZone: 'America/Mexico_City',
    strategyVersion: 'v1',
  },
  dataQuality: {},
  evidenceSummary: {},
  evaluationStatuses: {},
  profileSampleSizes: [],
  globalTargetLadder: [],
  mfeMaeByProfile: [],
  strategyProfiles: [],
  strategyProfileSemantics: {},
  watchProfiles: [],
  forwardPerformance: {},
});

jest.mock('../src/config/container', () => ({
  researchSnapshotService: { generate },
}));

const buildRequest = (method = 'GET') => ({
  method,
});

describe('researchSnapshot endpoint', () => {
  beforeEach(() => {
    generate.mockClear();
  });

  it('returns a read-only research snapshot', async () => {
    const { researchSnapshot } = await import('../src/functions/researchSnapshot');

    const response = await researchSnapshot(
      buildRequest() as never,
      { log: jest.fn(), error: jest.fn() } as never,
    );

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual(
      expect.objectContaining({
        ok: true,
        schemaVersion: '1',
        snapshot: expect.objectContaining({ strategyVersion: 'v1' }),
      }),
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does not run evaluators or market scan from the endpoint contract', async () => {
    const { researchSnapshot } = await import('../src/functions/researchSnapshot');

    await researchSnapshot(buildRequest() as never, { log: jest.fn(), error: jest.fn() } as never);

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('rejects non-GET requests without generating a snapshot', async () => {
    const { researchSnapshot } = await import('../src/functions/researchSnapshot');

    const response = await researchSnapshot(
      buildRequest('POST') as never,
      { log: jest.fn(), error: jest.fn() } as never,
    );

    expect(response.status).toBe(405);
    expect(generate).not.toHaveBeenCalled();
  });
});

export {};
