import { RateLimiterService } from '../src/services/RateLimiterService';

describe('RateLimiterService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits the configured delay', async () => {
    jest.useFakeTimers();
    const service = new RateLimiterService(13_000);
    const waitPromise = service.wait();
    let resolved = false;

    waitPromise.then(() => {
      resolved = true;
    });

    await jest.advanceTimersByTimeAsync(12_999);
    expect(resolved).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await waitPromise;
    expect(resolved).toBe(true);
  });

  it('does not wait when delay is disabled', async () => {
    const service = new RateLimiterService(0);

    await expect(service.wait()).resolves.toBeUndefined();
  });
});
