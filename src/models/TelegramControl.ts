export interface TelegramControlUser {
  id?: string;
  username?: string;
  firstName?: string;
}

export interface TelegramControlChat {
  id?: string;
  type?: string;
}

export interface TelegramControlMessage {
  text?: string;
}

export interface TelegramControlCallback {
  id?: string;
  data?: string;
}

export type TelegramControlUpdateType = 'message' | 'callback_query' | 'unsupported';

export interface TelegramControlUpdate {
  updateId?: number;
  updateType?: TelegramControlUpdateType;
  user?: TelegramControlUser;
  chat?: TelegramControlChat;
  message?: TelegramControlMessage;
  callback?: TelegramControlCallback;
}


export interface InlineKeyboardButton {
  text: string;
  callbackData: string;
}

export interface InlineKeyboard {
  rows: InlineKeyboardButton[][];
}

export type ControlResponseCode =
  | 'OK'
  | 'UNAUTHORIZED'
  | 'HELP'
  | 'CANCELLED'
  | 'NOT_IMPLEMENTED'
  | 'INVALID_CALLBACK'
  | 'UNKNOWN_COMMAND';

export interface ControlResponse {
  text: string;
  keyboard?: InlineKeyboard;
  code: ControlResponseCode;
}

export interface TelegramConversationState {
  userId: string;
  flow: string;
  step: string;
  data: Record<string, unknown>;
  expiresAt: Date;
}
