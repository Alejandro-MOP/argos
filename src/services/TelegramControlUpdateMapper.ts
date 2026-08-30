import type { TelegramRawUpdate } from '../clients/TelegramControlClient';
import type { TelegramControlUpdate, TelegramControlUpdateType } from '../models/TelegramControl';

export interface TelegramControlMappedUpdate extends TelegramControlUpdate {
  updateId: number;
  callbackQueryId?: string;
  updateType: TelegramControlUpdateType;
}

export class TelegramControlUpdateMapper {
  public map(rawUpdate: TelegramRawUpdate): TelegramControlMappedUpdate | undefined {
    const updateId = rawUpdate.update_id;

    if (typeof updateId !== 'number' || !Number.isInteger(updateId)) {
      return undefined;
    }

    if (rawUpdate.message?.from?.id !== undefined && rawUpdate.message.chat?.id !== undefined) {
      return {
        updateId,
        updateType: 'message',
        user: {
          id: String(rawUpdate.message.from.id),
          username: rawUpdate.message.from.username,
          firstName: rawUpdate.message.from.first_name,
        },
        chat: {
          id: String(rawUpdate.message.chat.id),
          type: rawUpdate.message.chat.type,
        },
        message: {
          text: rawUpdate.message.text,
        },
      };
    }

    const callback = rawUpdate.callback_query;
    const callbackChat = callback?.message?.chat;
    if (callback?.from?.id !== undefined && callbackChat?.id !== undefined && callback.id) {
      return {
        updateId,
        updateType: 'callback_query',
        callbackQueryId: callback.id,
        user: {
          id: String(callback.from.id),
          username: callback.from.username,
          firstName: callback.from.first_name,
        },
        chat: {
          id: String(callbackChat.id),
          type: callbackChat.type,
        },
        callback: {
          id: callback.id,
          data: callback.data,
        },
      };
    }

    return undefined;
  }
}
