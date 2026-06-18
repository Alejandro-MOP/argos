export class RateLimiterService {
  public constructor(private readonly requestDelayMs: number) {}

  public async wait(): Promise<void> {
    if (this.requestDelayMs <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, this.requestDelayMs);
    });
  }
}
