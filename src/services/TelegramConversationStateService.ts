import type { TelegramConversationState } from '../models/TelegramControl';

export interface SetTelegramConversationStateInput {
  userId: string;
  flow: string;
  step: string;
  data?: Record<string, unknown>;
}

export class TelegramConversationStateService {
  private readonly states = new Map<string, TelegramConversationState>();

  public constructor(
    private readonly ttlMs = 15 * 60 * 1000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public get(userId: string): TelegramConversationState | undefined {
    const state = this.states.get(userId);

    if (!state) {
      return undefined;
    }

    if (state.expiresAt.getTime() <= this.now().getTime()) {
      this.states.delete(userId);
      return undefined;
    }

    return state;
  }

  public consumeExpired(userId: string): boolean {
    const state = this.states.get(userId);

    if (!state) {
      return false;
    }

    if (state.expiresAt.getTime() <= this.now().getTime()) {
      this.states.delete(userId);
      return true;
    }

    return false;
  }

  public set(input: SetTelegramConversationStateInput): TelegramConversationState {
    const state: TelegramConversationState = {
      userId: input.userId,
      flow: input.flow,
      step: input.step,
      data: input.data ?? {},
      expiresAt: new Date(this.now().getTime() + this.ttlMs),
    };

    this.states.set(input.userId, state);

    return state;
  }

  public clear(userId: string): void {
    this.states.delete(userId);
  }
}
