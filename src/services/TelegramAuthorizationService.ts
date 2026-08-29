import type { TelegramControlUser } from '../models/TelegramControl';

const TELEGRAM_USER_ID_PATTERN = /^\d+$/;

export class TelegramAuthorizationService {
  private readonly allowedUserIds: Set<string>;

  public constructor(allowedUserIds: string[] | string = []) {
    this.allowedUserIds = new Set(parseAllowedUserIds(allowedUserIds));
  }

  public isAuthorized(user?: TelegramControlUser): boolean {
    if (!user?.id) {
      return false;
    }

    return this.allowedUserIds.has(user.id.trim());
  }

  public getAllowedUserIds(): string[] {
    return [...this.allowedUserIds];
  }
}

export const parseAllowedUserIds = (value: string[] | string | undefined): string[] => {
  const entries = Array.isArray(value) ? value : (value ?? '').split(',');

  return entries
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && TELEGRAM_USER_ID_PATTERN.test(entry));
};
