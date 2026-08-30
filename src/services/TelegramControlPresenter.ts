import type { ForwardPerformanceSummary } from '../models/EvidenceSignal';
import type { ResearchSnapshot } from '../models/ResearchSnapshot';
import type { StrategyProfile, StrategyProfileSummary } from '../models/StrategyProfile';
import type { ControlResponse, InlineKeyboard } from '../models/TelegramControl';
import type { TelegramControlSystemStatus } from './TelegramControlReadOnlyQueryService';

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
  backResearch: 'argos:v1:navigation:research',
  backSystem: 'argos:v1:navigation:system',
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

  public researchSnapshot(snapshot: ResearchSnapshot): ControlResponse {
    const statuses = snapshot.evaluationStatuses;
    const mfeMae = firstMfeMaeProfile(snapshot.mfeMaeByProfile);

    return {
      code: 'OK',
      text: [
        '📊 ARGOS RESEARCH SNAPSHOT',
        '',
        `Strategy: ${snapshot.snapshot.strategyVersion}`,
        `Generated: ${snapshot.snapshot.snapshotDate}`,
        '',
        'Evidence',
        `Eligible: ${formatNumber(snapshot.evidenceSummary.totalEvidence)}`,
        `Operational opportunities: ${formatNumber(snapshot.evidenceSummary.operationalOpportunities)}`,
        `Operational threshold: ${formatNumber(snapshot.evidenceSummary.operationalThreshold)}`,
        '',
        'Forward Evaluation',
        `Resolved: ${formatNumber(snapshot.dataQuality.evaluatedEvidenceCount)}`,
        `Open: ${formatNumber(statuses.OPEN ?? 0)}`,
        `Closed: ${formatNumber(statuses.CLOSED ?? 0)}`,
        `Expired: ${formatNumber(statuses.EXPIRED ?? 0)}`,
        `Ambiguous: ${formatNumber(statuses.AMBIGUOUS ?? 0)}`,
        '',
        'Excursions',
        `MFE avg: ${formatPercent(mfeMae?.avgMfePercent)}`,
        `MAE avg: ${formatPercent(mfeMae?.avgMaePercent)}`,
        '',
        'MFE — máximo movimiento favorable después de la señal.',
        'MAE — máximo movimiento adverso después de la señal.',
      ].join('\n'),
      keyboard: this.researchDetailKeyboard(CALLBACKS.researchSnapshot),
    };
  }

  public strategyProfiles(summary: StrategyProfileSummary): ControlResponse {
    const profiles = summary.profiles;
    const distribution = countProfilesByMaturity(profiles);
    const topProfiles = [...profiles].sort((left, right) => right.sampleSize - left.sampleSize).slice(0, 5);

    return {
      code: 'OK',
      text: [
        '📈 STRATEGY PROFILES',
        '',
        `Profiles: ${formatNumber(profiles.length)}`,
        '',
        'Data maturity',
        `Mature: ${formatNumber(distribution.MATURE)}`,
        `Developing: ${formatNumber(distribution.DEVELOPING)}`,
        `Early: ${formatNumber(distribution.EARLY)}`,
        `Insufficient: ${formatNumber(distribution.INSUFFICIENT)}`,
        '',
        'Top samples:',
        ...formatTopProfiles(topProfiles),
        '',
        'Data maturity describe cantidad de evidencia, no rentabilidad ni validación estadística.',
      ].join('\n'),
      keyboard: this.researchDetailKeyboard(CALLBACKS.researchProfiles),
    };
  }

  public forwardPerformance(summary: ForwardPerformanceSummary): ControlResponse {
    return {
      code: 'OK',
      text: [
        '🧪 FORWARD PERFORMANCE',
        '',
        `Signals evaluated: ${formatNumber(summary.sampleSize)}`,
        `Small sample: ${summary.smallSample ? 'yes' : 'no'}`,
        '',
        `MFE average: ${formatPercent(summary.mfe.average)}`,
        `MAE average: ${formatPercent(summary.mae.average)}`,
        '',
        'Targets',
        ...formatForwardTargets(summary.experimentalTargets),
        '',
        'Win Rate usa el valor calculado por ARGOS.',
        'MFE — mayor movimiento del precio a favor de la señal.',
        'MAE — mayor movimiento del precio en contra de la señal.',
      ].join('\n'),
      keyboard: this.researchDetailKeyboard(CALLBACKS.researchPerformance),
    };
  }

  public systemStatus(status: TelegramControlSystemStatus): ControlResponse {
    return {
      code: 'OK',
      text: [
        '⚙️ ARGOS SYSTEM STATUS',
        '',
        `${status.controlBot === 'ONLINE' ? '🟢' : '🔴'} Control Bot: Online`,
        `${status.database === 'CONNECTED' ? '🟢' : '🔴'} Database: ${status.database === 'CONNECTED' ? 'Connected' : 'Unavailable'}`,
        `${status.researchServices === 'AVAILABLE' ? '🟢' : '🔴'} Research Services: ${status.researchServices === 'AVAILABLE' ? 'Available' : 'Unavailable'}`,
        '',
        'Mode:',
        status.mode,
        '',
        'Control Transport:',
        status.controlTransport,
      ].join('\n'),
      keyboard: this.systemDetailKeyboard(CALLBACKS.systemStatus),
    };
  }

  public queryError(feature: string): ControlResponse {
    return {
      code: 'ERROR',
      text: [`⚠️ ARGOS no pudo consultar ${feature}.`, '', 'Intenta nuevamente en unos momentos.'].join('\n'),
      keyboard: feature === 'System Status' ? this.systemDetailKeyboard(CALLBACKS.systemStatus) : this.researchDetailKeyboard(CALLBACKS.researchMenu),
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
        'V1.5-C permite consultar Research Snapshot, Strategy Profiles, Forward Performance y System Status en modo read-only.',
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

  private researchDetailKeyboard(refreshCallback: TelegramControlCallbackData): InlineKeyboard {
    return {
      rows: [
        [{ text: '🔄 Refresh', callbackData: refreshCallback }],
        [{ text: '⬅️ Back', callbackData: CALLBACKS.backResearch }],
      ],
    };
  }

  private systemDetailKeyboard(refreshCallback: TelegramControlCallbackData): InlineKeyboard {
    return {
      rows: [
        [{ text: '🔄 Refresh', callbackData: refreshCallback }],
        [{ text: '⬅️ Back', callbackData: CALLBACKS.backSystem }],
      ],
    };
  }
}

const firstMfeMaeProfile = (profiles: ResearchSnapshot['mfeMaeByProfile']): ResearchSnapshot['mfeMaeByProfile'][number] | undefined =>
  [...profiles].sort((left, right) => right.sampleSize - left.sampleSize)[0];

const countProfilesByMaturity = (profiles: StrategyProfile[]): Record<StrategyProfile['dataMaturity'], number> => ({
  INSUFFICIENT: profiles.filter((profile) => profile.dataMaturity === 'INSUFFICIENT').length,
  EARLY: profiles.filter((profile) => profile.dataMaturity === 'EARLY').length,
  DEVELOPING: profiles.filter((profile) => profile.dataMaturity === 'DEVELOPING').length,
  MATURE: profiles.filter((profile) => profile.dataMaturity === 'MATURE').length,
});

const formatTopProfiles = (profiles: StrategyProfile[]): string[] => {
  if (profiles.length === 0) {
    return ['Sin perfiles disponibles todavía.'];
  }

  return profiles.flatMap((profile) => [
    '',
    `${profile.assetType} · ${profile.timeframe} · ${profile.scoreBucket}`,
    `Samples: ${formatNumber(profile.sampleSize)}`,
    `Resolved: ${formatNumber(profile.resolvedSignalSampleSize)}`,
    `Maturity: ${profile.dataMaturity}`,
  ]);
};

const formatForwardTargets = (targets: ForwardPerformanceSummary['experimentalTargets']): string[] => {
  const visibleTargets = targets.filter((target) => [0.5, 1, 2, 3, 5].includes(target.targetPercent));

  if (visibleTargets.length === 0) {
    return ['Sin targets evaluados todavía.'];
  }

  return visibleTargets.flatMap((target) => [
    '',
    `${formatPercentValue(target.targetPercent)}`,
    `Wins: ${formatNumber(target.wins)}`,
    `Losses: ${formatNumber(target.losses)}`,
    `Win rate: ${formatPercent(target.winRate)}`,
    `Expectancy: ${formatPercent(target.historicalForwardExpectancyPercent)}`,
  ]);
};

const formatNumber = (value: number): string => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);

const formatPercent = (value: number | null | undefined): string => (value === null || value === undefined ? 'n/a' : `${formatPercentValue(value)}`);

const formatPercentValue = (value: number): string => `${formatDecimal(value)}%`;

const formatDecimal = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
