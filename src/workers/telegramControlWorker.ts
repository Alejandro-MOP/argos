import dotenv from 'dotenv';
import { TelegramControlClient } from '../clients/TelegramControlClient';
import { env } from '../config/env';
import {
  telegramCommandRouter,
  telegramControlAuthorizationService,
} from '../config/container';
import { TelegramControlPollingService } from '../services/TelegramControlPollingService';
import { TelegramControlUpdateMapper } from '../services/TelegramControlUpdateMapper';

dotenv.config();

export const createTelegramControlPollingService = (): TelegramControlPollingService =>
  new TelegramControlPollingService(
    {
      enabled: env.telegramControlEnabled,
      botToken: env.telegramControlBotToken,
      allowedUserIds: env.telegramControlAllowedUserIds,
    },
    {
      client: new TelegramControlClient(env.telegramControlBotToken),
      mapper: new TelegramControlUpdateMapper(),
      authorizationService: telegramControlAuthorizationService,
      router: telegramCommandRouter,
      logger: console,
    },
  );

const main = async (): Promise<void> => {
  const service = createTelegramControlPollingService();

  process.once('SIGINT', () => service.stop());
  process.once('SIGTERM', () => service.stop());

  await service.start();
};

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Telegram Control Worker failed.');
    process.exitCode = 1;
  });
}
