import { DailyPipelineUseCase } from "../application/use-cases/DailyPipelineUseCase";
import { YahooFinanceAdapter } from "../adapters/outbound/yahoo-finance/YahooFinanceAdapter";
import { SupabaseRecommendationRepository } from "../adapters/outbound/supabase/SupabaseRecommendationRepository";
import { GroqSentimentAdapter } from "../adapters/outbound/groq/GroqSentimentAdapter";
import { GroqNarratorAdapter } from "../adapters/outbound/groq/GroqNarratorAdapter";
import { Ticker } from "../core/domain/value-objects/Ticker";
import { parseTickerUniverse } from "./constants/idx-universe";

/**
 * Builds and returns a fully wired DailyPipelineUseCase.
 * All adapters are instantiated here and injected into the use case.
 */
export function buildPipeline(): DailyPipelineUseCase {
  const stockDataProvider = new YahooFinanceAdapter();
  const repository = new SupabaseRecommendationRepository();
  const sentimentAnalyzer = new GroqSentimentAdapter();
  const narrator = new GroqNarratorAdapter();
  const tickers = parseTickerUniverse(process.env.IDX_TICKERS).map(
    (t) => new Ticker(t),
  );

  return new DailyPipelineUseCase(
    stockDataProvider,
    repository,
    sentimentAnalyzer,
    narrator,
    tickers,
  );
}
