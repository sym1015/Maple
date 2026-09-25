const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `worker` over `items` with at most `concurrency` in flight, and a delay of
 * delayMs..delayMs+100 before each task so requests are spread out.
 */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  delayMs: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      if (delayMs > 0) await sleep(delayMs + Math.random() * 100);
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
}
