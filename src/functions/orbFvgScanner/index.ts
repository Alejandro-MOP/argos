import { app, type InvocationContext, type Timer } from '@azure/functions';
import { orbFvgScannerService } from '../../config/container';

export async function orbFvgScanner(_timer: Timer, context: InvocationContext): Promise<void> {
  await orbFvgScannerService.run(context);
}

app.timer('orbFvgScanner', {
  schedule: '0 */1 * * * *',
  handler: orbFvgScanner,
});

