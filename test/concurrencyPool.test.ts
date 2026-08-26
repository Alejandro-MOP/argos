import { runWithConcurrency } from '../src/utils/concurrencyPool';

describe('runWithConcurrency', () => {
  it('preserves result order while limiting active workers', async () => {
    let activeWorkers = 0;
    let maxActiveWorkers = 0;

    const results = await runWithConcurrency(
      [1, 2, 3, 4, 5],
      async (item) => {
        activeWorkers += 1;
        maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
        activeWorkers -= 1;
        return item * 10;
      },
      { concurrency: 2, batchDelayMs: 0 },
    );

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxActiveWorkers).toBeLessThanOrEqual(2);
  });

  it('falls back to one worker when concurrency is lower than one', async () => {
    let activeWorkers = 0;
    let maxActiveWorkers = 0;

    await runWithConcurrency(
      [1, 2, 3],
      async () => {
        activeWorkers += 1;
        maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
        await new Promise((resolve) => {
          setTimeout(resolve, 1);
        });
        activeWorkers -= 1;
      },
      { concurrency: 0, batchDelayMs: 0 },
    );

    expect(maxActiveWorkers).toBe(1);
  });
});
