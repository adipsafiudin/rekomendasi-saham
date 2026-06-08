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

// IDX daily recommendations need to tolerate sparse local news coverage.
// Technical/fundamental signals carry more weight; sentiment is confirmation.
export const BUY_THRESHOLD = 0.64;

export class DecisionService {
  decide(inputs: ScoringInputs): DecisionResult {
    // Normalize sentiment from (-1,1) to (0,1)
    const sentimentNormalized = (inputs.sentimentRaw + 1) / 2;

    // Weighted aggregate: 50% technical + 40% fundamental + 10% sentiment
    const aggregatedScore =
      0.5 * inputs.technicalScore.number +
      0.4 * inputs.fundamentalScore.number +
      0.1 * sentimentNormalized;

    return {
      aggregatedScore,
      sentimentNormalized,
      shouldBuy: aggregatedScore >= BUY_THRESHOLD,
    };
  }
}
