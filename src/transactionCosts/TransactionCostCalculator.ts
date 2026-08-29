import Decimal from 'decimal.js';
import type {
  BrokerProductProfile,
  ExecutionMode,
  FeeRule,
  MoneyAmount,
  TransactionCostBreakdown,
  TransactionCostInput,
  TransactionCostResult,
} from '../models/TransactionCost';

const BREAK_EVEN_MIN_PERCENT = new Decimal(0);
const BREAK_EVEN_MAX_PERCENT = new Decimal(100);
const BREAK_EVEN_TOLERANCE = new Decimal('0.000001');
const BREAK_EVEN_MAX_ITERATIONS = 120;
const PERCENT_OUTPUT_DECIMALS = 6;

export class TransactionCostCalculationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'TransactionCostCalculationError';
  }
}

export class TransactionCostCalculator {
  evaluate(input: TransactionCostInput, profile: BrokerProductProfile): TransactionCostResult {
    this.validateInput(input, profile);
    this.validateProfile(profile);

    const entryNotional = new Decimal(input.entryNotional.amount);
    const grossTargetPercent = new Decimal(input.grossTargetPercent);
    const grossExitValue = this.calculateExitNotional(entryNotional, grossTargetPercent);
    const grossProfit = grossExitValue.minus(entryNotional);
    const buyRule = this.selectRule(profile, input.buyExecutionMode, 'buy');
    const sellRule = this.selectRule(profile, input.sellExecutionMode, 'sell');
    const buyCost = this.calculateFee(entryNotional, buyRule, profile);
    const sellCost = this.calculateFee(grossExitValue, sellRule, profile);
    const roundTripCost = buyCost.feeDecimal.plus(sellCost.feeDecimal);
    const totalCashRequired = entryNotional.plus(buyCost.feeDecimal);
    const netProfit = grossProfit.minus(roundTripCost);
    const netReturnPercent = netProfit.div(entryNotional).mul(100);
    const breakEvenGrossTargetPercent = this.calculateBreakEvenGrossTargetPercent(
      entryNotional,
      buyRule,
      sellRule,
      profile,
    );

    return {
      brokerProfileId: profile.id,
      broker: profile.broker,
      product: profile.product,
      feeScheduleVersion: profile.feeSchedule.version,
      effectiveFrom: profile.feeSchedule.effectiveFrom.toISOString(),
      effectiveTo: profile.feeSchedule.effectiveTo?.toISOString(),
      sourceLabel: profile.feeSchedule.sourceLabel,
      sourceUrl: profile.feeSchedule.sourceUrl,
      verifiedAt: profile.feeSchedule.verifiedAt.toISOString(),
      notes: profile.feeSchedule.notes,
      entryNotional: this.money(entryNotional, profile),
      grossTargetPercent: this.roundPercent(grossTargetPercent),
      grossExitValue: this.money(grossExitValue, profile),
      exitNotional: this.money(grossExitValue, profile),
      grossProfit: this.money(grossProfit, profile),
      buyExecutionMode: input.buyExecutionMode,
      sellExecutionMode: input.sellExecutionMode,
      buyCost: this.toBreakdown(entryNotional, buyCost, profile),
      sellCost: this.toBreakdown(grossExitValue, sellCost, profile),
      roundTripCost: this.money(roundTripCost, profile),
      totalCashRequired: this.money(totalCashRequired, profile),
      netProfit: this.money(netProfit, profile),
      netReturnPercent: this.roundPercent(netReturnPercent),
      breakEvenGrossTargetPercent: this.roundPercent(breakEvenGrossTargetPercent),
      grossTargetBelowBreakEven: grossTargetPercent.lessThan(breakEvenGrossTargetPercent),
      assumptions: {
        spreadIncluded: false,
        slippageIncluded: false,
        fundingCostsIncluded: false,
        withdrawalCostsIncluded: false,
        fxCostsIncluded: false,
      },
    };
  }

  private calculateExitNotional(entryNotional: Decimal, grossTargetPercent: Decimal): Decimal {
    return entryNotional.mul(new Decimal(1).plus(grossTargetPercent.div(100)));
  }

  private calculateFee(
    notional: Decimal,
    rule: FeeRule,
    profile: BrokerProductProfile,
  ): CalculatedFee {
    if (rule.type !== 'PERCENTAGE_NOTIONAL') {
      throw new TransactionCostCalculationError(
        `Unsupported fee rule type: ${rule.type}`,
        'unsupported-fee-rule',
      );
    }

    const rawFee = notional.mul(new Decimal(rule.percent).div(100));
    const minimum = rule.minimumAmount ? new Decimal(rule.minimumAmount.amount) : undefined;
    const maximum = rule.maximumAmount ? new Decimal(rule.maximumAmount.amount) : undefined;
    let fee = rawFee;
    let appliedMinimum = false;
    let appliedMaximum = false;

    if (minimum !== undefined && fee.lessThan(minimum)) {
      fee = minimum;
      appliedMinimum = true;
    }

    if (maximum !== undefined && fee.greaterThan(maximum)) {
      fee = maximum;
      appliedMaximum = true;
    }

    return {
      feeDecimal: fee,
      feePercentOfNotional: notional.isZero() ? new Decimal(0) : fee.div(notional).mul(100),
      ruleType: rule.type,
      appliedMinimum,
      appliedMaximum,
      currency: profile.quoteCurrency,
    };
  }

  private calculateBreakEvenGrossTargetPercent(
    entryNotional: Decimal,
    buyRule: FeeRule,
    sellRule: FeeRule,
    profile: BrokerProductProfile,
  ): Decimal {
    if (this.canUseDirectBreakEvenFormula(buyRule, sellRule)) {
      const buyFeeRatio = new Decimal(buyRule.percent).div(100);
      const sellFeeRatio = new Decimal(sellRule.percent).div(100);
      return buyFeeRatio.plus(sellFeeRatio).div(new Decimal(1).minus(sellFeeRatio)).mul(100);
    }

    return this.calculateBreakEvenByBinarySearch(entryNotional, buyRule, sellRule, profile);
  }

  private canUseDirectBreakEvenFormula(buyRule: FeeRule, sellRule: FeeRule): boolean {
    return !buyRule.minimumAmount && !buyRule.maximumAmount && !sellRule.minimumAmount && !sellRule.maximumAmount;
  }

  private calculateBreakEvenByBinarySearch(
    entryNotional: Decimal,
    buyRule: FeeRule,
    sellRule: FeeRule,
    profile: BrokerProductProfile,
  ): Decimal {
    let low = BREAK_EVEN_MIN_PERCENT;
    let high = BREAK_EVEN_MAX_PERCENT;

    if (this.netProfitAtTargetPercent(entryNotional, high, buyRule, sellRule, profile).lessThan(0)) {
      throw new TransactionCostCalculationError(
        'Break-even gross target was not found within the supported 0% to 100% range.',
        'break-even-not-found',
      );
    }

    for (let iteration = 0; iteration < BREAK_EVEN_MAX_ITERATIONS; iteration += 1) {
      const mid = low.plus(high).div(2);
      const netProfit = this.netProfitAtTargetPercent(entryNotional, mid, buyRule, sellRule, profile);

      if (netProfit.abs().lessThanOrEqualTo(BREAK_EVEN_TOLERANCE)) {
        return mid;
      }

      if (netProfit.lessThan(0)) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const candidate = low.plus(high).div(2);
    const candidateProfit = this.netProfitAtTargetPercent(
      entryNotional,
      candidate,
      buyRule,
      sellRule,
      profile,
    );

    if (candidateProfit.abs().lessThanOrEqualTo(BREAK_EVEN_TOLERANCE.mul(10))) {
      return candidate;
    }

    throw new TransactionCostCalculationError(
      'Break-even binary search did not converge.',
      'break-even-convergence-failed',
    );
  }

  private netProfitAtTargetPercent(
    entryNotional: Decimal,
    grossTargetPercent: Decimal,
    buyRule: FeeRule,
    sellRule: FeeRule,
    profile: BrokerProductProfile,
  ): Decimal {
    const exitNotional = this.calculateExitNotional(entryNotional, grossTargetPercent);
    const grossProfit = exitNotional.minus(entryNotional);
    const buyFee = this.calculateFee(entryNotional, buyRule, profile).feeDecimal;
    const sellFee = this.calculateFee(exitNotional, sellRule, profile).feeDecimal;

    return grossProfit.minus(buyFee).minus(sellFee);
  }

  private selectRule(profile: BrokerProductProfile, mode: ExecutionMode, side: 'buy' | 'sell'): FeeRule {
    if (mode === 'MAKER') {
      return side === 'buy' ? profile.feeSchedule.tradeCosts.makerBuy : profile.feeSchedule.tradeCosts.makerSell;
    }

    if (mode === 'TAKER') {
      return side === 'buy' ? profile.feeSchedule.tradeCosts.takerBuy : profile.feeSchedule.tradeCosts.takerSell;
    }

    throw new TransactionCostCalculationError(`Invalid execution mode: ${mode}`, 'invalid-execution-mode');
  }

  private toBreakdown(
    notional: Decimal,
    calculatedFee: CalculatedFee,
    profile: BrokerProductProfile,
  ): TransactionCostBreakdown {
    return {
      notional: this.money(notional, profile),
      fee: this.money(calculatedFee.feeDecimal, profile),
      feePercentOfNotional: this.roundPercent(calculatedFee.feePercentOfNotional),
      ruleType: calculatedFee.ruleType,
      appliedMinimum: calculatedFee.appliedMinimum,
      appliedMaximum: calculatedFee.appliedMaximum,
    };
  }

  private money(amount: Decimal, profile: BrokerProductProfile): MoneyAmount {
    return {
      amount: amount.toDecimalPlaces(profile.currencyDecimals).toNumber(),
      currency: profile.quoteCurrency,
    };
  }

  private roundPercent(value: Decimal): number {
    return value.toDecimalPlaces(PERCENT_OUTPUT_DECIMALS).toNumber();
  }

  private validateInput(input: TransactionCostInput, profile: BrokerProductProfile): void {
    if (!Number.isFinite(input.entryNotional.amount) || input.entryNotional.amount <= 0) {
      throw new TransactionCostCalculationError('entryNotional.amount must be greater than 0.', 'invalid-capital');
    }

    if (input.entryNotional.currency !== profile.quoteCurrency) {
      throw new TransactionCostCalculationError(
        `Input currency ${input.entryNotional.currency} does not match profile quote currency ${profile.quoteCurrency}.`,
        'currency-mismatch',
      );
    }

    if (!Number.isFinite(input.grossTargetPercent) || input.grossTargetPercent < 0) {
      throw new TransactionCostCalculationError(
        'grossTargetPercent must be greater than or equal to 0.',
        'invalid-gross-target',
      );
    }

    const asOf = input.asOf ?? new Date();

    if (asOf < profile.feeSchedule.effectiveFrom) {
      throw new TransactionCostCalculationError(
        'Fee schedule is not effective yet for the requested date.',
        'fee-schedule-not-effective',
      );
    }

    if (profile.feeSchedule.effectiveTo && asOf > profile.feeSchedule.effectiveTo) {
      throw new TransactionCostCalculationError(
        'Fee schedule is no longer effective for the requested date.',
        'fee-schedule-not-effective',
      );
    }
  }

  private validateProfile(profile: BrokerProductProfile): void {
    if (!Number.isInteger(profile.currencyDecimals) || profile.currencyDecimals < 0) {
      throw new TransactionCostCalculationError(
        'Profile currencyDecimals must be a non-negative integer.',
        'invalid-fee-schedule',
      );
    }

    Object.values(profile.feeSchedule.tradeCosts).forEach((rule) => this.validateRule(rule, profile));
  }

  private validateRule(rule: FeeRule, profile: BrokerProductProfile): void {
    if (rule.type !== 'PERCENTAGE_NOTIONAL') {
      throw new TransactionCostCalculationError(
        `Unsupported fee rule type: ${rule.type}`,
        'unsupported-fee-rule',
      );
    }

    if (!Number.isFinite(rule.percent) || rule.percent < 0) {
      throw new TransactionCostCalculationError(
        'PERCENTAGE_NOTIONAL fee percent must be greater than or equal to 0.',
        'invalid-fee-schedule',
      );
    }

    const minimum = rule.minimumAmount;
    const maximum = rule.maximumAmount;

    if (minimum) {
      this.validateFeeLimit(minimum, profile);
    }

    if (maximum) {
      this.validateFeeLimit(maximum, profile);
    }

    if (minimum && maximum && maximum.amount < minimum.amount) {
      throw new TransactionCostCalculationError(
        'Fee maximumAmount must be greater than or equal to minimumAmount.',
        'invalid-fee-schedule',
      );
    }
  }

  private validateFeeLimit(limit: MoneyAmount, profile: BrokerProductProfile): void {
    if (limit.currency !== profile.quoteCurrency) {
      throw new TransactionCostCalculationError(
        'Fee minimum/maximum currency must match profile quote currency.',
        'invalid-fee-schedule',
      );
    }

    if (!Number.isFinite(limit.amount) || limit.amount < 0) {
      throw new TransactionCostCalculationError(
        'Fee minimum/maximum amount must be greater than or equal to 0.',
        'invalid-fee-schedule',
      );
    }
  }
}

interface CalculatedFee {
  feeDecimal: Decimal;
  feePercentOfNotional: Decimal;
  ruleType: 'PERCENTAGE_NOTIONAL';
  appliedMinimum: boolean;
  appliedMaximum: boolean;
  currency: string;
}
