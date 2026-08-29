import type { ControlResponse, InlineKeyboard } from '../models/TelegramControl';

export const CALLBACKS = {
  mainMenu: 'argos:v1:menu:main',
  researchMenu: 'argos:v1:menu:research',
  marketMenu: 'argos:v1:menu:market',
  costsMenu: 'argos:v1:menu:costs',
  systemMenu: 'argos:v1:menu:system',
  researchSnapshot: 'argos:v1:research:snapshot',
  researchProfiles: 'argos:v1:research:profiles',
  researchPerformance: 'argos:v1:research:performance',
  marketScan: 'argos:v1:market:scan',
  marketAnalyze: 'argos:v1:market:analyze',
  costsBitsoMxn: 'argos:v1:costs:bitso_mxn',
  costsBitsoUsdc: 'argos:v1:costs:bitso_usdc',
  systemStatus: 'argos:v1:system:status',
  systemHelp: 'argos:v1:system:help',
  back: 'argos:v1:navigation:back',
} as const;

export type TelegramControlCallbackData = (typeof CALLBACKS)[keyof typeof CALLBACKS];

export class TelegramControlPresenter {
  public mainMenu(): ControlResponse {
    return {
      code: 'OK',
      text: 'ARGOS Control\n\nSelecciona una opción:',
      keyboard: {
        rows: [
          [
            { text: '📊 Research', callbackData: CALLBACKS.researchMenu },
            { text: '🔎 Market', callbackData: CALLBACKS.marketMenu },
          ],
          [
            { text: '💰 Costs', callbackData: CALLBACKS.costsMenu },
            { text: '⚙️ System', callbackData: CALLBACKS.systemMenu },
          ],
        ],
      },
    };
  }

  public researchMenu(): ControlResponse {
    return {
      code: 'OK',
      text: 'Research\n\n¿Qué quieres consultar?',
      keyboard: this.singleColumnKeyboard([
        ['📊 Snapshot', CALLBACKS.researchSnapshot],
        ['📈 Strategy Profiles', CALLBACKS.researchProfiles],
        ['🧪 Forward Performance', CALLBACKS.researchPerformance],
        ['⬅️ Back', CALLBACKS.back],
      ]),
    };
  }

  public marketMenu(): ControlResponse {
    return {
      code: 'OK',
      text: 'Market\n\nElige una acción:',
      keyboard: this.singleColumnKeyboard([
        ['🔎 Analyze Symbol', CALLBACKS.marketAnalyze],
        ['🚀 Run Market Scan', CALLBACKS.marketScan],
        ['⬅️ Back', CALLBACKS.back],
      ]),
    };
  }

  public costsMenu(): ControlResponse {
    return {
      code: 'OK',
      text: 'Costs\n\nElige el perfil de costos:',
      keyboard: this.singleColumnKeyboard([
        ['🇲🇽 Bitso MXN', CALLBACKS.costsBitsoMxn],
        ['💵 Bitso USDC', CALLBACKS.costsBitsoUsdc],
        ['⬅️ Back', CALLBACKS.back],
      ]),
    };
  }

  public systemMenu(): ControlResponse {
    return {
      code: 'OK',
      text: 'System\n\nHerramientas del sistema:',
      keyboard: this.singleColumnKeyboard([
        ['❤️ Status', CALLBACKS.systemStatus],
        ['❓ Help', CALLBACKS.systemHelp],
        ['⬅️ Back', CALLBACKS.back],
      ]),
    };
  }

  public help(): ControlResponse {
    return {
      code: 'HELP',
      text: [
        'ARGOS Control Help',
        '',
        '/start o /menu abre el menú principal.',
        '/cancel cancela cualquier flujo activo.',
        '',
        'V1.5-A sólo valida autorización, routing, presenter y estado en memoria.',
      ].join('\n'),
      keyboard: this.backKeyboard(),
    };
  }

  public cancelled(): ControlResponse {
    return {
      code: 'CANCELLED',
      text: 'Operación cancelada. Puedes volver al menú principal con /menu.',
      keyboard: this.backKeyboard(),
    };
  }

  public unauthorized(): ControlResponse {
    return {
      code: 'UNAUTHORIZED',
      text: 'No autorizado.',
    };
  }

  public unknownCommand(): ControlResponse {
    return {
      code: 'UNKNOWN_COMMAND',
      text: 'Comando no reconocido. Usa /menu para abrir ARGOS Control.',
      keyboard: this.backKeyboard(),
    };
  }

  public invalidCallback(reason: string): ControlResponse {
    return {
      code: 'INVALID_CALLBACK',
      text: `Callback inválido: ${reason}.`,
      keyboard: this.backKeyboard(),
    };
  }

  public notImplemented(feature: string): ControlResponse {
    return {
      code: 'NOT_IMPLEMENTED',
      text: `${feature} integration is not available yet.`,
      keyboard: this.backKeyboard(),
    };
  }

  private singleColumnKeyboard(items: Array<[string, TelegramControlCallbackData]>): InlineKeyboard {
    return {
      rows: items.map(([text, callbackData]) => [{ text, callbackData }]),
    };
  }

  private backKeyboard(): InlineKeyboard {
    return {
      rows: [[{ text: '⬅️ Back', callbackData: CALLBACKS.back }]],
    };
  }
}
