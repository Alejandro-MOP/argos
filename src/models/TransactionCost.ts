import type { AssetType } from './MarketSymbol';

export type BrokerId = 'BITSO' | 'GBM' | 'IBKR';

export type BrokerProductProfileId =
  | 'BITSO_CRYPTO_MXN'
  | 'BITSO_CRYPTO_USDC'
  | 'GBM_TRADING_USA'
  | 'IBKR_US_STOCKS';

export type ExecutionMode = 'MAKER' | 'TAKER';
export type CurrencyCode = 'MXN' | 'USD' | 'USDC';

export interface MoneyAmount {
  amount: number;
  currency: CurrencyCode;
}

export interface TransactionCostInput {
  entryNotional: MoneyAmount;
  grossTargetPercent: number;
  buyExecutionMode: ExecutionMode;
  sellExecutionMode: ExecutionMode;
  asOf?: Date;
}

export type FeeRuleType = 'PERCENTAGE_NOTIONAL' | 'PER_UNIT' | 'FIXED' | 'COMPOSITE';

export interface PercentageNotionalFeeRule {
  type: 'PERCENTAGE_NOTIONAL';
  percent: number;
  minimumAmount?: MoneyAmount;
  maximumAmount?: MoneyAmount;
}

export type FeeRule = PercentageNotionalFeeRule;

export interface TradeCostSchedule {
  makerBuy: FeeRule;
  takerBuy: FeeRule;
  makerSell: FeeRule;
  takerSell: FeeRule;
}

export interface FeeScheduleMetadata {
  broker: BrokerId;
  productProfileId: BrokerProductProfileId;
  version: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  sourceLabel: string;
  sourceUrl?: string;
  verifiedAt: Date;
  notes?: string;
}

export interface FeeSchedule extends FeeScheduleMetadata {
  tradeCosts: TradeCostSchedule;
}

export interface BrokerProductProfile {
  id: BrokerProductProfileId;
  broker: BrokerId;
  product: string;
  assetType: AssetType;
  quoteCurrency: CurrencyCode;
  currencyDecimals: number;
  feeSchedule: FeeSchedule;
}

export interface TransactionCostBreakdown {
  notional: MoneyAmount;
  fee: MoneyAmount;
  feePercentOfNotional: number;
  ruleType: FeeRuleType;
  appliedMinimum: boolean;
  appliedMaximum: boolean;
}

export interface TransactionCostResult {
  brokerProfileId: BrokerProductProfileId;
  broker: BrokerId;
  product: string;
  feeScheduleVersion: string;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceLabel: string;
  sourceUrl?: string;
  verifiedAt: string;
  notes?: string;
  entryNotional: MoneyAmount;
  grossTargetPercent: number;
  grossExitValue: MoneyAmount;
  exitNotional: MoneyAmount;
  grossProfit: MoneyAmount;
  buyExecutionMode: ExecutionMode;
  sellExecutionMode: ExecutionMode;
  buyCost: TransactionCostBreakdown;
  sellCost: TransactionCostBreakdown;
  roundTripCost: MoneyAmount;
  totalCashRequired: MoneyAmount;
  netProfit: MoneyAmount;
  netReturnPercent: number;
  breakEvenGrossTargetPercent: number;
  grossTargetBelowBreakEven: boolean;
  assumptions: {
    spreadIncluded: false;
    slippageIncluded: false;
    fundingCostsIncluded: false;
    withdrawalCostsIncluded: false;
    fxCostsIncluded: false;
  };
}
