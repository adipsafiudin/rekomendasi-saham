import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  IRecommendationRepository,
  ResolutionData,
} from "../../../core/ports/outbound/IRecommendationRepository";
import { Recommendation } from "../../../core/domain/entities/Recommendation";
import { Ticker } from "../../../core/domain/value-objects/Ticker";

interface RecommendationRow {
  id: string;
  ticker: string;
  date: string;
  entry_price: number;
  target_price: number;
  stop_loss: number;
  technical_score: number;
  fundamental_score: number;
  sentiment_score: number;
  aggregated_score: number;
  sentiment_json: { score: number; reasoning: string };
  narrative: string;
  win_rate_at_recommendation: number;
  status: "PENDING" | "SUCCESS" | "FAILED";
  resolution_date: string | null;
  resolution_price: number | null;
  resolution_reason: string | null;
  technical_breakdown: unknown | null;
  fundamental_breakdown: unknown | null;
}

export class SupabaseRecommendationRepository implements IRecommendationRepository {
  private client: SupabaseClient;
  private readonly TABLE = "recommendation_history";

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    this.client = createClient(url, key);
  }

  async save(rec: Recommendation): Promise<void> {
    const { error } = await this.client.from(this.TABLE).upsert(
      {
        ticker: rec.ticker.raw,
        date: rec.date.toISOString().split("T")[0],
        entry_price: rec.entryPrice,
        target_price: rec.targetPrice,
        stop_loss: rec.stopLoss,
        technical_score: rec.technicalScore,
        fundamental_score: rec.fundamentalScore,
        sentiment_score: rec.sentimentScore,
        aggregated_score: rec.aggregatedScore,
        sentiment_json: rec.sentimentJson,
        narrative: rec.narrative,
        win_rate_at_recommendation: rec.winRateAtRecommendation,
        technical_breakdown: rec.technicalBreakdown ?? null,
        fundamental_breakdown: rec.fundamentalBreakdown ?? null,
        status: rec.status,
      },
      { onConflict: "ticker,date", ignoreDuplicates: false },
    );
    if (error) throw new Error(`Supabase save error: ${error.message}`);
  }

  async findPending(): Promise<Recommendation[]> {
    const { data, error } = await this.client
      .from(this.TABLE)
      .select("*")
      .eq("status", "PENDING");

    if (error) throw new Error(`Supabase findPending error: ${error.message}`);
    return (data as RecommendationRow[]).map(this.rowToEntity);
  }

  async updateStatus(id: string, resolution: ResolutionData): Promise<void> {
    const { error } = await this.client
      .from(this.TABLE)
      .update({
        status: resolution.status,
        resolution_date: resolution.resolutionDate.toISOString().split("T")[0],
        resolution_price: resolution.resolutionPrice,
        resolution_reason: resolution.resolutionReason,
      })
      .eq("id", id);

    if (error) throw new Error(`Supabase updateStatus error: ${error.message}`);
  }

  async getWinRate(): Promise<number> {
    const { data, error } = await this.client
      .from(this.TABLE)
      .select("status")
      .in("status", ["SUCCESS", "FAILED"]);

    if (error) throw new Error(`Supabase getWinRate error: ${error.message}`);
    if (!data || data.length === 0) return 0;

    const wins = data.filter((r) => r.status === "SUCCESS").length;
    return wins / data.length;
  }

  private rowToEntity(row: RecommendationRow): Recommendation {
    return {
      id: row.id,
      ticker: new Ticker(row.ticker),
      date: new Date(row.date),
      entryPrice: row.entry_price,
      targetPrice: row.target_price,
      stopLoss: row.stop_loss,
      technicalScore: row.technical_score,
      fundamentalScore: row.fundamental_score,
      sentimentScore: row.sentiment_score,
      aggregatedScore: row.aggregated_score,
      sentimentJson: row.sentiment_json,
      narrative: row.narrative,
      winRateAtRecommendation: row.win_rate_at_recommendation,
      technicalBreakdown: (row.technical_breakdown as never) ?? undefined,
      fundamentalBreakdown: (row.fundamental_breakdown as never) ?? undefined,
      status: row.status,
      resolutionDate: row.resolution_date
        ? new Date(row.resolution_date)
        : undefined,
      resolutionPrice: row.resolution_price ?? undefined,
      resolutionReason: row.resolution_reason ?? undefined,
    };
  }
}
