import { TelegramMarketScanExecutionGuard } from '../src/services/TelegramMarketScanExecutionGuard';

describe('TelegramMarketScanExecutionGuard', () => {
  it('allows a single active scan and releases idempotently', () => {
    const guard = new TelegramMarketScanExecutionGuard();

    const release = guard.tryAcquire();

    expect(release).toEqual(expect.any(Function));
    expect(guard.isRunning()).toBe(true);
    expect(guard.tryAcquire()).toBeUndefined();

    release?.();
    release?.();

    expect(guard.isRunning()).toBe(false);
    expect(guard.tryAcquire()).toEqual(expect.any(Function));
  });
});
