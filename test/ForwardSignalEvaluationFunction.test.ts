const execute = jest.fn().mockResolvedValue({ ok: true });

jest.mock('../src/config/container', () => ({
  forwardSignalEvaluator: { execute },
}));

jest.mock('../src/config/env', () => ({
  env: { forwardSignalEvaluationSchedule: '0 0 * * * *' },
}));

describe('forwardSignalEvaluation timer function', () => {
  it('delegates execution to ForwardSignalEvaluator', async () => {
    const { forwardSignalEvaluation } = await import('../src/functions/forwardSignalEvaluation');
    const context = { log: jest.fn(), error: jest.fn() };

    await forwardSignalEvaluation({} as never, context as never);

    expect(execute).toHaveBeenCalledWith({}, context);
  });
});
