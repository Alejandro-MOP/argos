export interface ConcurrencyPoolOptions {
  concurrency: number;
  batchDelayMs?: number;
}

export const runWithConcurrency = async <Item, Result>(
  items: Item[],
  worker: (item: Item, index: number) => Promise<Result>,
  options: ConcurrencyPoolOptions,
): Promise<Result[]> => {
  if (items.length === 0) {
    return [];
  }

  const concurrency = Math.max(1, Math.floor(options.concurrency));
  const batchDelayMs = Math.max(0, Math.floor(options.batchDelayMs ?? 0));
  const results = new Array<Result>(items.length);
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await worker(items[currentIndex], currentIndex);

      if (batchDelayMs > 0 && nextIndex < items.length) {
        await sleep(batchDelayMs);
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker(),
  );

  await Promise.all(workers);

  return results;
};

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
