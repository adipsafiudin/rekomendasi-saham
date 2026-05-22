import { Ticker } from "../value-objects/Ticker";
import { TechnicalBreakdown } from "../services/TechnicalScoringService";
import { FundamentalBreakdown } from "../services/FundamentalScoringService";

export type RecommendationStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface Recommendation {
  id: string;
  ticker: Ticker;
  date: Date;

  // Price targets
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;

  // Scores (all 0–1)
  technicalScore: number;
  fundamentalScore: number;
  sentimentScore: number; // normalized from (-1,1) to (0,1)
  aggregatedScore: number;

  // Groq outputs
  sentimentJson: { score: number; reasoning: string };
  narrative: string;

  // Backtesting metrics at time of recommendation
  winRateAtRecommendation: number;

  // Score breakdowns (per-indicator detail)
  technicalBreakdown?: TechnicalBreakdown;
  fundamentalBreakdown?: FundamentalBreakdown;

  // Lifecycle
  status: RecommendationStatus;
  resolutionDate?: Date;
  resolutionPrice?: number;
  resolutionReason?: string;
}
