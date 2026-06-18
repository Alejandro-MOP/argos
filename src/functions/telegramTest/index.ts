import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { notificationService } from '../../config/container';

const TELEGRAM_TEST_MESSAGE = '✅ market-signal-engine conectado a Telegram';

export async function telegramTest(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log('Prueba de Telegram solicitada');

  await notificationService.sendMessage(TELEGRAM_TEST_MESSAGE);

  return {
    status: 200,
    jsonBody: {
      ok: true,
      message: TELEGRAM_TEST_MESSAGE,
    },
  };
}

app.http('telegramTest', {
  methods: ['GET', 'POST'],
  authLevel: 'function',
  route: 'telegram-test',
  handler: telegramTest,
});
