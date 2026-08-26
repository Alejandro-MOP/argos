import type { EvidenceSignalEvaluationSnapshot, EvidenceTargetEvaluationSnapshot } from '../models/EvidenceSignal';

export interface EvidenceSignalEvaluationRepository {
  upsert(evaluation: EvidenceSignalEvaluationSnapshot): Promise<void>;
  upsertTargetEvaluations(targets: EvidenceTargetEvaluationSnapshot[]): Promise<void>;
}
