import { Recommendation } from "../entities/Recommendation";
import { OHLCVBar } from "../entities/Stock";

export interface AuditResult {
  resolved: boolean;
  status?: "SUCCESS" | "FAILED";
  resolutionDate?: Date;
  resolutionPrice?: number;
  resolutionReason?: string;
}

export class AuditService {
  /**
   * Check each bar after recommendation date to see if TP or SL was hit.
   * Conservative rule: if both TP and SL hit on same day, mark FAILED.
   */
  audit(
    recommendation: Recommendation,
    barsAfterEntry: OHLCVBar[],
  ): AuditResult {
    const { targetPrice, stopLoss } = recommendation;

    for (const bar of barsAfterEntry) {
      const tpHit = bar.high >= targetPrice;
      const slHit = bar.low <= stopLoss;

      if (tpHit && slHit) {
        // Both hit same candle — conservative: mark FAILED
        return {
          resolved: true,
          status: "FAILED",
          resolutionDate: bar.date,
          resolutionPrice: stopLoss,
          resolutionReason:
            "SL hit (both TP & SL triggered same day — conservative)",
        };
      }

      if (tpHit) {
        return {
          resolved: true,
          status: "SUCCESS",
          resolutionDate: bar.date,
          resolutionPrice: targetPrice,
          resolutionReason: "Target price reached",
        };
      }

      if (slHit) {
        return {
          resolved: true,
          status: "FAILED",
          resolutionDate: bar.date,
          resolutionPrice: stopLoss,
          resolutionReason: "Stop loss triggered",
        };
      }
    }

    return { resolved: false };
  }
}
