import { Score } from "../value-objects/Score";

export interface ScoringInputs {
  technicalScore: Score;
  fundamentalScore: Score;
  sentimentRaw: number; // -1.0 to 1.0 from Groq
}

export interface DecisionResult {
  aggregatedScore: number;
  sentimentNormalized: number;
  shouldBuy: boolean;
}

// MoS now contributes 25% of fundamental score, making the scoring more calibrated.
// Threshold lowered 0.75 → 0.68 to reflect improved signal quality.
const BUY_THRESHOLD = 0.68;

export class DecisionService {
  decide(inputs: ScoringInputs): DecisionResult {
    // Normalize sentiment from (-1,1) to (0,1)
    const sentimentNormalized = (inputs.sentimentRaw + 1) / 2;

    // Weighted aggregate: 40% technical + 40% fundamental + 20% sentiment
    const aggregatedScore =
      0.4 * inputs.technicalScore.number +
      0.4 * inputs.fundamentalScore.number +
      0.2 * sentimentNormalized;

    return {
      aggregatedScore,
      sentimentNormalized,
      shouldBuy: aggregatedScore >= BUY_THRESHOLD,
    };
  }
}
