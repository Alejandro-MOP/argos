import type {
  EvidenceSignalEvaluationSnapshot,
  EvidenceTargetEvaluationSnapshot,
} from '../models/EvidenceSignal';
import type { EvidenceSignalEvaluationRepository } from '../ports/EvidenceSignalEvaluationRepository';

export class MemoryEvidenceSignalEvaluationRepository implements EvidenceSignalEvaluationRepository {
  private readonly evaluations = new Map<string, EvidenceSignalEvaluationSnapshot>();
  private readonly targetEvaluations = new Map<string, EvidenceTargetEvaluationSnapshot>();

  public async upsert(evaluation: EvidenceSignalEvaluationSnapshot): Promise<void> {
    this.evaluations.set(evaluation.evidenceSignalId, evaluation);
  }

  public async upsertTargetEvaluations(targets: EvidenceTargetEvaluationSnapshot[]): Promise<void> {
    for (const target of targets) {
      this.targetEvaluations.set(`${target.evidenceSignalId}:${target.targetPercent}`, target);
    }
  }

  public findEvaluation(evidenceSignalId: string): EvidenceSignalEvaluationSnapshot | undefined {
    return this.evaluations.get(evidenceSignalId);
  }

  public findTargetEvaluations(evidenceSignalId: string): EvidenceTargetEvaluationSnapshot[] {
    return [...this.targetEvaluations.values()].filter((target) => target.evidenceSignalId === evidenceSignalId);
  }
}
