import type { SignalEvaluationSnapshot } from '../models/ForwardSignal';

export interface SignalEvaluationRepository {
  findBySignalId(signalId: string): Promise<SignalEvaluationSnapshot | undefined>;
  upsert(evaluation: SignalEvaluationSnapshot): Promise<void>;
}
