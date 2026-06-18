import { app, type InvocationContext, type Timer } from '@azure/functions';
import { marketScanExecutor } from '../../config/container';
import { env } from '../../config/env';

export async function marketScan(_timer: Timer, context: InvocationContext): Promise<void> {
  await marketScanExecutor.run(
    {
      timeframe: env.marketScanTimeframe,
      candleLimit: env.marketScanCandleLimit,
      notify: true,
    },
    context,
  );
}

app.timer('marketScan', {
  schedule: env.marketScanSchedule,
  handler: marketScan,
});
