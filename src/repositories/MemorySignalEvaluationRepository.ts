import type { SignalEvaluationSnapshot } from '../models/ForwardSignal';
import type { SignalEvaluationRepository } from '../ports/SignalEvaluationRepository';

export class MemorySignalEvaluationRepository implements SignalEvaluationRepository {
  private readonly evaluations = new Map<string, SignalEvaluationSnapshot>();

  public async findBySignalId(signalId: string): Promise<SignalEvaluationSnapshot | undefined> {
    const evaluation = this.evaluations.get(signalId);
    return evaluation ? { ...evaluation } : undefined;
  }

  public async upsert(evaluation: SignalEvaluationSnapshot): Promise<void> {
    this.evaluations.set(evaluation.signalId, { ...evaluation });
  }

  public async findAll(): Promise<SignalEvaluationSnapshot[]> {
    return [...this.evaluations.values()].map((evaluation) => ({ ...evaluation }));
  }
}
