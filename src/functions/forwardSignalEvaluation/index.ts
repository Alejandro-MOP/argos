import { app, type InvocationContext, type Timer } from '@azure/functions';
import { forwardSignalEvaluator } from '../../config/container';
import { env } from '../../config/env';

export async function forwardSignalEvaluation(
  _timer: Timer,
  context: InvocationContext,
): Promise<void> {
  await forwardSignalEvaluator.execute({}, context);
}

app.timer('forwardSignalEvaluation', {
  schedule: env.forwardSignalEvaluationSchedule,
  handler: forwardSignalEvaluation,
});
