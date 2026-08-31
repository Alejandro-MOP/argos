export class TelegramMarketScanExecutionGuard {
  private running = false;

  public isRunning(): boolean {
    return this.running;
  }

  public tryAcquire(): (() => void) | undefined {
    if (this.running) {
      return undefined;
    }

    this.running = true;
    let released = false;

    return () => {
      if (!released) {
        released = true;
        this.running = false;
      }
    };
  }
}
