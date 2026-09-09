import { randomUUID } from 'crypto';
import type { Queryable } from '../db/postgres';
import type {
  OrbFvgCandleSnapshot,
  OrbFvgResearchState,
  OrbFvgSignalFilters,
  OrbFvgSignalLevelSnapshot,
  OrbFvgSignalSnapshot,
  OrbFvgSignalWithLevels,
  PersistedOrbFvgSignalSnapshot,
} from '../models/OrbFvgSignal';
import type { OrbFvgSaveResult, OrbFvgSignalRepository } from '../ports/OrbFvgSignalRepository';

interface OrbFvgSignalRow {
  id: string;
  experiment_version: string;
  ticker: string;
  provider_symbol: string;
  asset_type: 'STOCK' | 'ETF';
  sector: string | null;
  industry: string | null;
  market: string | null;
  exchange: string | null;
  session_date: string | Date;
  direction: 'LONG' | 'SHORT';
  opening_range_candle_timestamp: Date;
  opening_range_open: string | number;
  opening_range_high: string | number;
  opening_range_low: string | number;
  opening_range_close: string | number;
  opening_range_size_pct: string | number;
  breakout_at: Date;
  breakout_candle_timestamp: Date;
  breakout_open: string | number;
  breakout_high: string | number;
  breakout_low: string | number;
  breakout_close: string | number;
  breakout_distance_pct: string | number;
  wick_breakout: boolean;
  close_breakout: boolean;
  fvg_candle1_timestamp: Date;
  fvg_candle1_open: string | number;
  fvg_candle1_high: string | number;
  fvg_candle1_low: string | number;
  fvg_candle1_close: string | number;
  fvg_candle2_timestamp: Date;
  fvg_candle2_open: string | number;
  fvg_candle2_high: string | number;
  fvg_candle2_low: string | number;
  fvg_candle2_close: string | number;
  fvg_candle3_timestamp: Date;
  fvg_candle3_open: string | number;
  fvg_candle3_high: string | number;
  fvg_candle3_low: string | number;
  fvg_candle3_close: string | number;
  fvg_low: string | number;
  fvg_high: string | number;
  fvg_midpoint: string | number | null;
  fvg_size_pct: string | number;
  candles_after_breakout: number;
  signal_at: Date;
  orb_fvg_state: OrbFvgResearchState | null;
  setup_timeframe: string | null;
  scanner_run_at: Date | null;
  detected_at: Date | null;
  detection_lag_seconds: number | null;
  retest_count: number | null;
  first_retest_at: Date | null;
  latest_retest_at: Date | null;
  retest_candle_timestamp: Date | null;
  retest_low: string | number | null;
  retest_high: string | number | null;
  retest_close: string | number | null;
  retest_depth_pct: string | number | null;
  pre_retrace_high: string | number | null;
  pre_retrace_high_timestamp: Date | null;
  structure_break_candle_timestamp: Date | null;
  structure_break_open: string | number | null;
  structure_break_high: string | number | null;
  structure_break_low: string | number | null;
  structure_break_close: string | number | null;
  continuation_candle_timestamp: Date | null;
  continuation_open: string | number | null;
  continuation_high: string | number | null;
  continuation_low: string | number | null;
  continuation_close: string | number | null;
  setup_ready_at: Date | null;
  expired_at: Date | null;
  entry_price: string | number | null;
  stop_price: string | number | null;
  risk: string | number | null;
  risk_pct: string | number | null;
  target_2r_price: string | number | null;
  status: 'OPEN' | 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'EXPIRED';
  outcome: 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'EXPIRED' | null;
  highest_price_seen: string | number;
  lowest_price_seen: string | number;
  mfe_pct: string | number;
  mae_pct: string | number;
  max_r: string | number;
  target_reached_at: Date | null;
  stop_reached_at: Date | null;
  resolved_at: Date | null;
  telegram_alert_sent: boolean;
  created_at: Date;
  updated_at: Date;
}

interface OrbFvgLevelRow {
  id: string;
  orb_fvg_signal_id: string;
  r_multiple: string | number;
  level_price: string | number;
  triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresOrbFvgSignalRepository implements OrbFvgSignalRepository {
  public constructor(private readonly database: Queryable) {}

  public async saveIfNotDuplicate(
    signal: OrbFvgSignalSnapshot,
    levels: OrbFvgSignalLevelSnapshot[],
  ): Promise<OrbFvgSaveResult> {
    const id = signal.id ?? randomUUID();
    const columns = [
      'id', 'experiment_version', 'ticker', 'provider_symbol', 'asset_type', 'sector', 'industry', 'market', 'exchange',
      'session_date', 'direction', 'opening_range_candle_timestamp', 'opening_range_open', 'opening_range_high',
      'opening_range_low', 'opening_range_close', 'opening_range_size_pct', 'breakout_at', 'breakout_candle_timestamp',
      'breakout_open', 'breakout_high', 'breakout_low', 'breakout_close', 'breakout_distance_pct', 'wick_breakout',
      'close_breakout', 'fvg_candle1_timestamp', 'fvg_candle1_open', 'fvg_candle1_high', 'fvg_candle1_low',
      'fvg_candle1_close', 'fvg_candle2_timestamp', 'fvg_candle2_open', 'fvg_candle2_high', 'fvg_candle2_low',
      'fvg_candle2_close', 'fvg_candle3_timestamp', 'fvg_candle3_open', 'fvg_candle3_high', 'fvg_candle3_low',
      'fvg_candle3_close', 'fvg_low', 'fvg_high', 'fvg_midpoint', 'fvg_size_pct', 'candles_after_breakout', 'signal_at',
      'orb_fvg_state', 'setup_timeframe', 'scanner_run_at', 'detected_at', 'detection_lag_seconds', 'retest_count',
      'first_retest_at', 'latest_retest_at', 'retest_candle_timestamp', 'retest_low', 'retest_high', 'retest_close',
      'retest_depth_pct', 'pre_retrace_high', 'pre_retrace_high_timestamp', 'structure_break_candle_timestamp',
      'structure_break_open', 'structure_break_high', 'structure_break_low', 'structure_break_close',
      'continuation_candle_timestamp', 'continuation_open', 'continuation_high', 'continuation_low', 'continuation_close',
      'setup_ready_at', 'expired_at', 'entry_price', 'stop_price', 'risk', 'risk_pct', 'target_2r_price', 'status', 'outcome',
      'highest_price_seen', 'lowest_price_seen', 'mfe_pct', 'mae_pct', 'max_r', 'target_reached_at', 'stop_reached_at',
      'resolved_at', 'telegram_alert_sent',
    ];
    const values = buildSignalValues(id, signal);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
    const result = await this.database.query<OrbFvgSignalRow>(
      `INSERT INTO orb_fvg_signals (${columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT (ticker, session_date, direction, experiment_version, breakout_candle_timestamp)
       DO NOTHING
       RETURNING *`,
      values,
    );

    if (!result.rowCount || result.rows.length === 0) {
      return { inserted: false };
    }

    await this.insertLevels(result.rows[0].id, levels);
    return { inserted: true, signal: mapSignalRow(result.rows[0]) };
  }

  public async findOpen(limit = 100): Promise<PersistedOrbFvgSignalSnapshot[]> {
    const result = await this.database.query<OrbFvgSignalRow>(
      `SELECT * FROM orb_fvg_signals
       WHERE status = 'OPEN'
         AND (
           orb_fvg_state IS NULL
           OR (
             orb_fvg_state = 'TRADE_READY'
             AND entry_price IS NOT NULL
             AND stop_price IS NOT NULL
             AND risk IS NOT NULL
             AND target_2r_price IS NOT NULL
           )
         )
       ORDER BY signal_at ASC LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapSignalRow);
  }

  public async updateForwardState(signal: OrbFvgSignalSnapshot): Promise<void> {
    if (!signal.id) {
      return;
    }
    await this.database.query(
      `UPDATE orb_fvg_signals SET
        status = $2,
        outcome = $3,
        highest_price_seen = $4,
        lowest_price_seen = $5,
        mfe_pct = $6,
        mae_pct = $7,
        max_r = $8,
        target_reached_at = $9,
        stop_reached_at = $10,
        resolved_at = $11,
        updated_at = now()
      WHERE id = $1`,
      [
        signal.id,
        signal.status,
        signal.outcome ?? null,
        signal.highestPriceSeen,
        signal.lowestPriceSeen,
        signal.mfePct,
        signal.maePct,
        signal.maxR,
        signal.targetReachedAt ?? null,
        signal.stopReachedAt ?? null,
        signal.resolvedAt ?? null,
      ],
    );
  }

  public async updateSetupState(signal: OrbFvgSignalSnapshot): Promise<void> {
    if (!signal.id) {
      return;
    }
    await this.database.query(
      `UPDATE orb_fvg_signals SET
        orb_fvg_state = $2,
        scanner_run_at = $3,
        retest_count = $4,
        first_retest_at = $5,
        latest_retest_at = $6,
        retest_candle_timestamp = $7,
        retest_low = $8,
        retest_high = $9,
        retest_close = $10,
        retest_depth_pct = $11,
        pre_retrace_high = $12,
        pre_retrace_high_timestamp = $13,
        structure_break_candle_timestamp = $14,
        structure_break_open = $15,
        structure_break_high = $16,
        structure_break_low = $17,
        structure_break_close = $18,
        continuation_candle_timestamp = $19,
        continuation_open = $20,
        continuation_high = $21,
        continuation_low = $22,
        continuation_close = $23,
        setup_ready_at = $24,
        expired_at = $25,
        telegram_alert_sent = $26,
        updated_at = now()
      WHERE id = $1`,
      [
        signal.id,
        signal.orbFvgState ?? null,
        signal.scannerRunAt ?? null,
        signal.retestCount ?? null,
        signal.firstRetestAt ?? null,
        signal.latestRetestAt ?? null,
        signal.retestCandleTimestamp ?? null,
        signal.retestLow ?? null,
        signal.retestHigh ?? null,
        signal.retestClose ?? null,
        signal.retestDepthPct ?? null,
        signal.preRetraceHigh ?? null,
        signal.preRetraceHighTimestamp ?? null,
        signal.structureBreakCandleTimestamp ?? null,
        signal.structureBreakOpen ?? null,
        signal.structureBreakHigh ?? null,
        signal.structureBreakLow ?? null,
        signal.structureBreakClose ?? null,
        signal.continuationCandleTimestamp ?? null,
        signal.continuationOpen ?? null,
        signal.continuationHigh ?? null,
        signal.continuationLow ?? null,
        signal.continuationClose ?? null,
        signal.setupReadyAt ?? null,
        signal.expiredAt ?? null,
        signal.telegramAlertSent,
      ],
    );
  }

  public async claimLevelTrigger(
    signalId: string,
    rMultiple: number,
    triggeredAt: Date,
  ): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE orb_fvg_signal_levels
       SET triggered_at = $3, updated_at = now()
       WHERE orb_fvg_signal_id = $1 AND r_multiple = $2 AND triggered_at IS NULL`,
      [signalId, rMultiple, triggeredAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async find(filters: OrbFvgSignalFilters = {}): Promise<OrbFvgSignalWithLevels[]> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (filters.sessionDate) {
      values.push(filters.sessionDate);
      conditions.push(`session_date = $${values.length}`);
    }
    if (filters.ticker) {
      values.push(filters.ticker.toUpperCase());
      conditions.push(`ticker = $${values.length}`);
    }
    if (filters.assetType) {
      values.push(filters.assetType);
      conditions.push(`asset_type = $${values.length}`);
    }
    if (filters.direction) {
      values.push(filters.direction);
      conditions.push(`direction = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }
    if (filters.experimentVersion) {
      values.push(filters.experimentVersion);
      conditions.push(`experiment_version = $${values.length}`);
    }
    values.push(filters.limit ?? 100);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const signals = await this.database.query<OrbFvgSignalRow>(
      `SELECT * FROM orb_fvg_signals ${where} ORDER BY signal_at DESC LIMIT $${values.length}`,
      values,
    );
    if (signals.rows.length === 0) {
      return [];
    }
    const ids = signals.rows.map((row) => row.id);
    const levels = await this.database.query<OrbFvgLevelRow>(
      `SELECT * FROM orb_fvg_signal_levels WHERE orb_fvg_signal_id = ANY($1::uuid[]) ORDER BY r_multiple ASC`,
      [ids],
    );
    const levelsBySignal = new Map<string, OrbFvgSignalLevelSnapshot[]>();
    for (const level of levels.rows) {
      levelsBySignal.set(level.orb_fvg_signal_id, [
        ...(levelsBySignal.get(level.orb_fvg_signal_id) ?? []),
        mapLevelRow(level),
      ]);
    }
    return signals.rows.map((row) => ({
      signal: mapSignalRow(row),
      levels: levelsBySignal.get(row.id) ?? [],
    }));
  }

  private async insertLevels(signalId: string, levels: OrbFvgSignalLevelSnapshot[]): Promise<void> {
    for (const level of levels) {
      await this.database.query(
        `INSERT INTO orb_fvg_signal_levels (id, orb_fvg_signal_id, r_multiple, level_price, triggered_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (orb_fvg_signal_id, r_multiple) DO NOTHING`,
        [
          level.id ?? randomUUID(),
          signalId,
          level.rMultiple,
          level.levelPrice,
          level.triggeredAt ?? null,
        ],
      );
    }
  }
}

const buildSignalValues = (id: string, signal: OrbFvgSignalSnapshot): unknown[] => [
  id,
  signal.experimentVersion,
  signal.ticker,
  signal.providerSymbol,
  signal.assetType,
  signal.sector ?? null,
  signal.industry ?? null,
  signal.market ?? null,
  signal.exchange ?? null,
  signal.sessionDate,
  signal.direction,
  signal.openingRangeCandle.timestamp,
  signal.openingRangeCandle.open,
  signal.openingRangeCandle.high,
  signal.openingRangeCandle.low,
  signal.openingRangeCandle.close,
  signal.openingRangeSizePct,
  signal.breakoutAt,
  signal.breakoutCandle.timestamp,
  signal.breakoutCandle.open,
  signal.breakoutCandle.high,
  signal.breakoutCandle.low,
  signal.breakoutCandle.close,
  signal.breakoutDistancePct,
  signal.wickBreakout,
  signal.closeBreakout,
  signal.fvgCandle1.timestamp,
  signal.fvgCandle1.open,
  signal.fvgCandle1.high,
  signal.fvgCandle1.low,
  signal.fvgCandle1.close,
  signal.fvgCandle2.timestamp,
  signal.fvgCandle2.open,
  signal.fvgCandle2.high,
  signal.fvgCandle2.low,
  signal.fvgCandle2.close,
  signal.fvgCandle3.timestamp,
  signal.fvgCandle3.open,
  signal.fvgCandle3.high,
  signal.fvgCandle3.low,
  signal.fvgCandle3.close,
  signal.fvgLow,
  signal.fvgHigh,
  signal.fvgMidpoint ?? null,
  signal.fvgSizePct,
  signal.candlesAfterBreakout,
  signal.signalAt,
  signal.orbFvgState ?? null,
  signal.setupTimeframe ?? null,
  signal.scannerRunAt ?? null,
  signal.detectedAt ?? null,
  signal.detectionLagSeconds ?? null,
  signal.retestCount ?? null,
  signal.firstRetestAt ?? null,
  signal.latestRetestAt ?? null,
  signal.retestCandleTimestamp ?? null,
  signal.retestLow ?? null,
  signal.retestHigh ?? null,
  signal.retestClose ?? null,
  signal.retestDepthPct ?? null,
  signal.preRetraceHigh ?? null,
  signal.preRetraceHighTimestamp ?? null,
  signal.structureBreakCandleTimestamp ?? null,
  signal.structureBreakOpen ?? null,
  signal.structureBreakHigh ?? null,
  signal.structureBreakLow ?? null,
  signal.structureBreakClose ?? null,
  signal.continuationCandleTimestamp ?? null,
  signal.continuationOpen ?? null,
  signal.continuationHigh ?? null,
  signal.continuationLow ?? null,
  signal.continuationClose ?? null,
  signal.setupReadyAt ?? null,
  signal.expiredAt ?? null,
  signal.entryPrice ?? null,
  signal.stopPrice ?? null,
  signal.risk ?? null,
  signal.riskPct ?? null,
  signal.target2RPrice ?? null,
  signal.status,
  signal.outcome ?? null,
  signal.highestPriceSeen,
  signal.lowestPriceSeen,
  signal.mfePct,
  signal.maePct,
  signal.maxR,
  signal.targetReachedAt ?? null,
  signal.stopReachedAt ?? null,
  signal.resolvedAt ?? null,
  signal.telegramAlertSent,
];

const candle = (
  timestamp: Date,
  open: string | number,
  high: string | number,
  low: string | number,
  close: string | number,
): OrbFvgCandleSnapshot => ({
  timestamp: new Date(timestamp),
  open: Number(open),
  high: Number(high),
  low: Number(low),
  close: Number(close),
});

const optionalNumber = (value: string | number | null): number | undefined =>
  value === null ? undefined : Number(value);

const optionalDate = (value: Date | null): Date | undefined => value ? new Date(value) : undefined;

const mapSignalRow = (row: OrbFvgSignalRow): PersistedOrbFvgSignalSnapshot => ({
  id: row.id,
  experimentVersion: row.experiment_version,
  ticker: row.ticker,
  providerSymbol: row.provider_symbol,
  assetType: row.asset_type,
  sector: row.sector ?? undefined,
  industry: row.industry ?? undefined,
  market: row.market ?? undefined,
  exchange: row.exchange ?? undefined,
  sessionDate:
    typeof row.session_date === 'string'
      ? row.session_date
      : row.session_date.toISOString().slice(0, 10),
  direction: row.direction,
  openingRangeCandle: candle(
    row.opening_range_candle_timestamp,
    row.opening_range_open,
    row.opening_range_high,
    row.opening_range_low,
    row.opening_range_close,
  ),
  openingRangeSizePct: Number(row.opening_range_size_pct),
  breakoutAt: new Date(row.breakout_at),
  breakoutCandle: candle(
    row.breakout_candle_timestamp,
    row.breakout_open,
    row.breakout_high,
    row.breakout_low,
    row.breakout_close,
  ),
  breakoutDistancePct: Number(row.breakout_distance_pct),
  wickBreakout: row.wick_breakout,
  closeBreakout: row.close_breakout,
  fvgCandle1: candle(row.fvg_candle1_timestamp, row.fvg_candle1_open, row.fvg_candle1_high, row.fvg_candle1_low, row.fvg_candle1_close),
  fvgCandle2: candle(row.fvg_candle2_timestamp, row.fvg_candle2_open, row.fvg_candle2_high, row.fvg_candle2_low, row.fvg_candle2_close),
  fvgCandle3: candle(row.fvg_candle3_timestamp, row.fvg_candle3_open, row.fvg_candle3_high, row.fvg_candle3_low, row.fvg_candle3_close),
  fvgLow: Number(row.fvg_low),
  fvgHigh: Number(row.fvg_high),
  fvgMidpoint: optionalNumber(row.fvg_midpoint),
  fvgSizePct: Number(row.fvg_size_pct),
  candlesAfterBreakout: row.candles_after_breakout,
  signalAt: new Date(row.signal_at),
  orbFvgState: row.orb_fvg_state ?? undefined,
  setupTimeframe: row.setup_timeframe ?? undefined,
  scannerRunAt: optionalDate(row.scanner_run_at),
  detectedAt: optionalDate(row.detected_at),
  detectionLagSeconds: row.detection_lag_seconds ?? undefined,
  retestCount: row.retest_count ?? undefined,
  firstRetestAt: optionalDate(row.first_retest_at),
  latestRetestAt: optionalDate(row.latest_retest_at),
  retestCandleTimestamp: optionalDate(row.retest_candle_timestamp),
  retestLow: optionalNumber(row.retest_low),
  retestHigh: optionalNumber(row.retest_high),
  retestClose: optionalNumber(row.retest_close),
  retestDepthPct: optionalNumber(row.retest_depth_pct),
  preRetraceHigh: optionalNumber(row.pre_retrace_high),
  preRetraceHighTimestamp: optionalDate(row.pre_retrace_high_timestamp),
  structureBreakCandleTimestamp: optionalDate(row.structure_break_candle_timestamp),
  structureBreakOpen: optionalNumber(row.structure_break_open),
  structureBreakHigh: optionalNumber(row.structure_break_high),
  structureBreakLow: optionalNumber(row.structure_break_low),
  structureBreakClose: optionalNumber(row.structure_break_close),
  continuationCandleTimestamp: optionalDate(row.continuation_candle_timestamp),
  continuationOpen: optionalNumber(row.continuation_open),
  continuationHigh: optionalNumber(row.continuation_high),
  continuationLow: optionalNumber(row.continuation_low),
  continuationClose: optionalNumber(row.continuation_close),
  setupReadyAt: optionalDate(row.setup_ready_at),
  expiredAt: optionalDate(row.expired_at),
  entryPrice: optionalNumber(row.entry_price),
  stopPrice: optionalNumber(row.stop_price),
  risk: optionalNumber(row.risk),
  riskPct: optionalNumber(row.risk_pct),
  target2RPrice: optionalNumber(row.target_2r_price),
  status: row.status,
  outcome: row.outcome ?? undefined,
  highestPriceSeen: Number(row.highest_price_seen),
  lowestPriceSeen: Number(row.lowest_price_seen),
  mfePct: Number(row.mfe_pct),
  maePct: Number(row.mae_pct),
  maxR: Number(row.max_r),
  targetReachedAt: optionalDate(row.target_reached_at),
  stopReachedAt: optionalDate(row.stop_reached_at),
  resolvedAt: optionalDate(row.resolved_at),
  telegramAlertSent: row.telegram_alert_sent,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const mapLevelRow = (row: OrbFvgLevelRow): OrbFvgSignalLevelSnapshot => ({
  id: row.id,
  orbFvgSignalId: row.orb_fvg_signal_id,
  rMultiple: Number(row.r_multiple),
  levelPrice: Number(row.level_price),
  triggeredAt: row.triggered_at ? new Date(row.triggered_at) : undefined,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});
