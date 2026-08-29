const evaluate = jest.fn().mockReturnValue({
  result: {
    brokerProfileId: 'BITSO_CRYPTO_MXN',
    entryNotional: { amount: 5_000, currency: 'MXN' },
    grossTargetPercent: 2,
    grossProfit: { amount: 100, currency: 'MXN' },
    buyCost: { fee: { amount: 39, currency: 'MXN' } },
    sellCost: { fee: { amount: 39.78, currency: 'MXN' } },
    roundTripCost: { amount: 78.78, currency: 'MXN' },
    totalCashRequired: { amount: 5039, currency: 'MXN' },
    netProfit: { amount: 21.22, currency: 'MXN' },
    netReturnPercent: 0.4244,
    breakEvenGrossTargetPercent: 1.572264,
    grossTargetBelowBreakEven: false,
  },
  interpretation: {
    grossMarketMovementPercent: 2,
    netInvestorReturnPercent: 0.4244,
    breakEvenPercent: 1.572264,
    targetCoversModeledCosts: true,
  },
});

jest.mock('../src/config/container', () => ({
  transactionCostService: { evaluate },
}));

const buildRequest = (body: unknown, method = 'POST') => ({
  method,
  json: jest.fn().mockResolvedValue(body),
});

describe('transactionCostsEvaluate endpoint', () => {
  beforeEach(() => {
    jest.resetModules();
    evaluate.mockClear();
    evaluate.mockReturnValue({
      result: {
        brokerProfileId: 'BITSO_CRYPTO_MXN',
        entryNotional: { amount: 5_000, currency: 'MXN' },
        grossTargetPercent: 2,
        grossProfit: { amount: 100, currency: 'MXN' },
        buyCost: { fee: { amount: 39, currency: 'MXN' } },
        sellCost: { fee: { amount: 39.78, currency: 'MXN' } },
        roundTripCost: { amount: 78.78, currency: 'MXN' },
        totalCashRequired: { amount: 5039, currency: 'MXN' },
        netProfit: { amount: 21.22, currency: 'MXN' },
        netReturnPercent: 0.4244,
        breakEvenGrossTargetPercent: 1.572264,
        grossTargetBelowBreakEven: false,
      },
      interpretation: {
        grossMarketMovementPercent: 2,
        netInvestorReturnPercent: 0.4244,
        breakEvenPercent: 1.572264,
        targetCoversModeledCosts: true,
      },
    });
  });

  it('returns 200 for valid POST with result and interpretation', async () => {
    const { transactionCostsEvaluate } = await import('../src/functions/transactionCosts');
    const body = {
      brokerProfileId: 'BITSO_CRYPTO_MXN',
      entryNotional: { amount: 5_000, currency: 'MXN' },
      grossTargetPercent: 2,
      buyExecution: 'TAKER',
      sellExecution: 'TAKER',
    };

    const response = await transactionCostsEvaluate(
      buildRequest(body) as never,
      { error: jest.fn() } as never,
    );

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({
      ok: true,
      result: expect.objectContaining({ brokerProfileId: 'BITSO_CRYPTO_MXN' }),
      interpretation: {
        grossMarketMovementPercent: 2,
        netInvestorReturnPercent: 0.4244,
        breakEvenPercent: 1.572264,
        targetCoversModeledCosts: true,
      },
    });
    expect(evaluate).toHaveBeenCalledWith(body);
  });

  it('rejects non-POST methods', async () => {
    const { transactionCostsEvaluate } = await import('../src/functions/transactionCosts');

    const response = await transactionCostsEvaluate(
      buildRequest({}, 'GET') as never,
      { error: jest.fn() } as never,
    );

    expect(response.status).toBe(405);
    expect(response.jsonBody).toEqual({
      ok: false,
      error: 'method-not-allowed',
      message: 'Use POST /api/transaction-costs/evaluate',
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed body', async () => {
    const { transactionCostsEvaluate } = await import('../src/functions/transactionCosts');
    const response = await transactionCostsEvaluate(
      { method: 'POST', json: jest.fn().mockRejectedValue(new Error('bad json')) } as never,
      { error: jest.fn() } as never,
    );

    expect(response.status).toBe(400);
    expect(response.jsonBody).toEqual({
      ok: false,
      error: 'invalid-request-body',
      message: 'Request body must be valid JSON.',
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid non-object body', async () => {
    const { transactionCostsEvaluate } = await import('../src/functions/transactionCosts');

    const response = await transactionCostsEvaluate(
      buildRequest([]) as never,
      { error: jest.fn() } as never,
    );

    expect(response.status).toBe(400);
    expect(response.jsonBody).toEqual(expect.objectContaining({ error: 'invalid-request-body' }));
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each([
    ['profile nonexistent', 'broker-profile-not-found', 404],
    ['invalid fields', 'invalid-capital', 400],
    ['break-even not found', 'break-even-not-found', 422],
    ['break-even convergence failed', 'break-even-convergence-failed', 422],
  ])('maps %s to HTTP %s', async (_caseName, code, statusCode) => {
    const { TransactionCostServiceError } = await import('../src/services/TransactionCostService');
    evaluate.mockImplementationOnce(() => {
      throw new TransactionCostServiceError(code, `${code} message`, statusCode);
    });
    const { transactionCostsEvaluate } = await import('../src/functions/transactionCosts');

    const response = await transactionCostsEvaluate(
      buildRequest({ brokerProfileId: 'BITSO_CRYPTO_MXN' }) as never,
      { error: jest.fn() } as never,
    );

    expect(response.status).toBe(statusCode);
    expect(response.jsonBody).toEqual({
      ok: false,
      error: code,
      message: `${code} message`,
    });
  });

  it('maps unexpected errors to HTTP 500', async () => {
    evaluate.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const { transactionCostsEvaluate } = await import('../src/functions/transactionCosts');
    const context = { error: jest.fn() };

    const response = await transactionCostsEvaluate(
      buildRequest({ brokerProfileId: 'BITSO_CRYPTO_MXN' }) as never,
      context as never,
    );

    expect(response.status).toBe(500);
    expect(response.jsonBody).toEqual({
      ok: false,
      error: 'transaction-cost-evaluation-failed',
      message: 'boom',
    });
    expect(context.error).toHaveBeenCalledWith('Transaction cost evaluation failed', { message: 'boom' });
  });
});

export {};
