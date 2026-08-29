import type {
  BrokerProductProfile,
  BrokerProductProfileId,
  CurrencyCode,
  ExecutionMode,
  MoneyAmount,
  TransactionCostInput,
  TransactionCostResult,
} from '../models/TransactionCost';
import { findBrokerProductProfile } from '../transactionCosts/BrokerProductProfileCatalog';
import { TransactionCostCalculationError } from '../transactionCosts/TransactionCostCalculator';
import type { TransactionCostCalculator } from '../transactionCosts/TransactionCostCalculator';

export interface TransactionCostEvaluationRequest {
  brokerProfileId?: unknown;
  entryNotional?: unknown;
  grossTargetPercent?: unknown;
  buyExecution?: unknown;
  sellExecution?: unknown;
  asOf?: unknown;
}

export interface TransactionCostInterpretation {
  grossMarketMovementPercent: number;
  netInvestorReturnPercent: number;
  breakEvenPercent: number;
  targetCoversModeledCosts: boolean;
}

export interface TransactionCostEvaluationResponse {
  result: TransactionCostResult;
  interpretation: TransactionCostInterpretation;
}

export class TransactionCostServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'TransactionCostServiceError';
  }
}

type FindBrokerProductProfile = (
  profileId: BrokerProductProfileId,
  asOf?: Date,
) => BrokerProductProfile | undefined;

export class TransactionCostService {
  public constructor(
    private readonly calculator: Pick<TransactionCostCalculator, 'evaluate'>,
    private readonly profileCatalog: FindBrokerProductProfile = findBrokerProductProfile,
  ) {}

  public evaluate(request: TransactionCostEvaluationRequest): TransactionCostEvaluationResponse {
    const brokerProfileId = this.parseBrokerProfileId(request.brokerProfileId);
    const entryNotional = this.parseEntryNotional(request.entryNotional);
    const grossTargetPercent = this.parseGrossTargetPercent(request.grossTargetPercent);
    const buyExecutionMode = this.parseExecutionMode(request.buyExecution, 'buyExecution');
    const sellExecutionMode = this.parseExecutionMode(request.sellExecution, 'sellExecution');
    const asOf = this.parseAsOf(request.asOf);
    const profile = this.resolveProfile(brokerProfileId);
    const input: TransactionCostInput = {
      entryNotional,
      grossTargetPercent,
      buyExecutionMode,
      sellExecutionMode,
      asOf,
    };

    try {
      const result = this.calculator.evaluate(input, profile);

      return {
        result,
        interpretation: {
          grossMarketMovementPercent: result.grossTargetPercent,
          netInvestorReturnPercent: result.netReturnPercent,
          breakEvenPercent: result.breakEvenGrossTargetPercent,
          targetCoversModeledCosts: !result.grossTargetBelowBreakEven,
        },
      };
    } catch (error) {
      if (error instanceof TransactionCostCalculationError) {
        throw mapCalculationError(error);
      }

      throw error;
    }
  }

  private parseBrokerProfileId(value: unknown): BrokerProductProfileId {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new TransactionCostServiceError(
        'missing-broker-profile-id',
        'brokerProfileId is required.',
      );
    }

    return value.trim() as BrokerProductProfileId;
  }

  private parseEntryNotional(value: unknown): MoneyAmount {
    if (!isRecord(value)) {
      throw new TransactionCostServiceError('missing-entry-notional', 'entryNotional is required.');
    }

    const amount = value.amount;
    const currency = value.currency;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new TransactionCostServiceError(
        'invalid-capital',
        'entryNotional.amount must be a number greater than 0.',
      );
    }

    if (typeof currency !== 'string' || currency.trim().length === 0) {
      throw new TransactionCostServiceError(
        'currency-mismatch',
        'entryNotional.currency is required and must match the broker profile currency.',
      );
    }

    return {
      amount,
      currency: currency.trim().toUpperCase() as CurrencyCode,
    };
  }

  private parseGrossTargetPercent(value: unknown): number {
    if (value === undefined || value === null) {
      throw new TransactionCostServiceError(
        'invalid-gross-target',
        'grossTargetPercent is required.',
      );
    }

    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TransactionCostServiceError(
        'invalid-gross-target',
        'grossTargetPercent must be a number greater than or equal to 0.',
      );
    }

    return value;
  }

  private parseExecutionMode(value: unknown, fieldName: 'buyExecution' | 'sellExecution'): ExecutionMode {
    if (typeof value !== 'string') {
      throw new TransactionCostServiceError(
        'invalid-execution-mode',
        `${fieldName} must be MAKER or TAKER.`,
      );
    }

    const normalized = value.trim().toUpperCase();
    if (normalized !== 'MAKER' && normalized !== 'TAKER') {
      throw new TransactionCostServiceError(
        'invalid-execution-mode',
        `${fieldName} must be MAKER or TAKER.`,
      );
    }

    return normalized;
  }

  private parseAsOf(value: unknown): Date | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new TransactionCostServiceError('invalid-as-of', 'asOf must be a valid date string.');
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new TransactionCostServiceError('invalid-as-of', 'asOf must be a valid date string.');
    }

    return parsed;
  }

  private resolveProfile(profileId: BrokerProductProfileId): BrokerProductProfile {
    const profile = this.profileCatalog(profileId);

    if (!profile) {
      throw new TransactionCostServiceError(
        'broker-profile-not-found',
        `Broker product profile ${profileId} was not found.`,
        404,
      );
    }

    return profile;
  }
}

const mapCalculationError = (error: TransactionCostCalculationError): TransactionCostServiceError => {
  const statusCode = error.code === 'break-even-not-found' || error.code === 'break-even-convergence-failed' ? 422 : 400;

  return new TransactionCostServiceError(error.code, error.message, statusCode);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
