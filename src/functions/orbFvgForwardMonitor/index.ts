import { app, type InvocationContext, type Timer } from '@azure/functions';
import { orbFvgForwardMonitorService } from '../../config/container';

export async function orbFvgForwardMonitor(_timer: Timer, context: InvocationContext): Promise<void> {
  await orbFvgForwardMonitorService.run(context);
}

app.timer('orbFvgForwardMonitor', {
  schedule: '0 */1 * * * *',
  handler: orbFvgForwardMonitor,
});

