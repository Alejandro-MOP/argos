import { app, type InvocationContext, type Timer } from '@azure/functions';
import { paperTradeMonitorService } from '../../config/container';

export async function paperTradeMonitor(_timer: Timer, context: InvocationContext): Promise<void> {
  await paperTradeMonitorService.run(context);
}

app.timer('paperTradeMonitor', {
  schedule: '0 */1 * * * *',
  handler: paperTradeMonitor,
});
