import { randomUUID } from "crypto";
import { IStockDataProvider } from "../../core/ports/outbound/IStockDataProvider";
import { IRecommendationRepository } from "../../core/ports/outbound/IRecommendationRepository";
import { ISentimentAnalyzer } from "../../core/ports/outbound/ISentimentAnalyzer";
import { INarrator } from "../../core/ports/outbound/INarrator";
import { Ticker } from "../../core/domain/value-objects/Ticker";
import { TechnicalScoringService } from "../../core/domain/services/TechnicalScoringService";
import { FundamentalScoringService } from "../../core/domain/services/FundamentalScoringService";
import { PriceTargetService } from "../../core/domain/services/PriceTargetService";
import { AuditService } from "../../core/domain/services/AuditService";
import { DecisionService } from "../../core/domain/services/DecisionService";
import { Recommendation } from "../../core/domain/entities/Recommendation";

const YAHOO_BATCH_SIZE = 10;
const YAHOO_BATCH_DELAY_MS = 1000;
// Groq free tier: 12,000 TPM. Each stock uses ~900 tokens (sentiment+narrator).
// Processing sequentially with 2s delay keeps us safely under ~900 TPM average.
const GROQ_INTER_TICKER_DELAY_MS = 2000;

export interface PipelineResult {
  audited: number;
  recommended: string[];
  errors: string[];
}

export class DailyPipelineUseCase {
  private technicalScorer = new TechnicalScoringService();
  private fundamentalScorer = new FundamentalScoringService();
  private priceTargetService = new PriceTargetService();
  private auditService = new AuditService();
  private decisionService = new DecisionService();

  constructor(
    private readonly stockDataProvider: IStockDataProvider,
    private readonly repository: IRecommendationRepository,
    private readonly sentimentAnalyzer: ISentimentAnalyzer,
    private readonly narrator: INarrator,
    private readonly tickers: Ticker[],
  ) {}

  async run(): Promise<PipelineResult> {
    const result: PipelineResult = { audited: 0, recommended: [], errors: [] };

    // Phase 1: Audit pending recommendations
    await this.auditPending(result);

    // Phase 2: Ingest & score each ticker in batches
    await this.scoreTickers(result);

    return result;
  }

  private async auditPending(result: PipelineResult): Promise<void> {
    const pending = await this.repository.findPending();

    for (const rec of pending) {
      try {
        // Fetch bars from entry date onwards (up to today)
        const bars = await this.stockDataProvider.getHistoricalOHLCV(
          rec.ticker,
          60,
        );
        const entryDate = rec.date;
        const barsAfterEntry = bars.filter((b) => b.date > entryDate);

        const auditResult = this.auditService.audit(rec, barsAfterEntry);
        if (auditResult.resolved) {
          await this.repository.updateStatus(rec.id, {
            status: auditResult.status!,
            resolutionDate: auditResult.resolutionDate!,
            resolutionPrice: auditResult.resolutionPrice!,
            resolutionReason: auditResult.resolutionReason!,
          });
          result.audited++;
        }
      } catch (err) {
        result.errors.push(`Audit ${rec.ticker.raw}: ${String(err)}`);
      }
    }
  }

  private async scoreTickers(result: PipelineResult): Promise<void> {
    const winRate = await this.repository.getWinRate();

    // Step 1: Fetch all Yahoo Finance data in parallel batches (fast, no rate limit)
    const stockDataList: Array<{
      ticker: Ticker;
      bars: Awaited<ReturnType<IStockDataProvider["getHistoricalOHLCV"]>>;
      fundamentals: Awaited<ReturnType<IStockDataProvider["getFundamentals"]>>;
      news: Awaited<ReturnType<IStockDataProvider["getNews"]>>;
    } | null> = [];

    for (let i = 0; i < this.tickers.length; i += YAHOO_BATCH_SIZE) {
      const batch = this.tickers.slice(i, i + YAHOO_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (ticker) => {
          try {
            const [bars, fundamentals, news] = await Promise.all([
              this.stockDataProvider.getHistoricalOHLCV(ticker, 120),
              this.stockDataProvider.getFundamentals(ticker),
              this.stockDataProvider.getNews(ticker),
            ]);
            return { ticker, bars, fundamentals, news };
          } catch (err) {
            result.errors.push(`Fetch ${ticker.raw}: ${String(err)}`);
            return null;
          }
        }),
      );
      stockDataList.push(...batchResults);

      if (i + YAHOO_BATCH_SIZE < this.tickers.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, YAHOO_BATCH_DELAY_MS),
        );
      }
    }

    // Step 2: Score & Groq calls sequentially to respect rate limits
    for (const data of stockDataList) {
      if (!data) continue;
      await this.processTickerWithData(
        data.ticker,
        data.bars,
        data.fundamentals,
        data.news,
        winRate,
        result,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, GROQ_INTER_TICKER_DELAY_MS),
      );
    }
  }

  private async processTickerWithData(
    ticker: Ticker,
    bars: Awaited<ReturnType<IStockDataProvider["getHistoricalOHLCV"]>>,
    fundamentals: Awaited<ReturnType<IStockDataProvider["getFundamentals"]>>,
    news: Awaited<ReturnType<IStockDataProvider["getNews"]>>,
    winRate: number,
    result: PipelineResult,
  ): Promise<void> {
    try {
      const techResult = this.technicalScorer.scoreWithBreakdown(bars);
      const fundResult =
        this.fundamentalScorer.scoreWithBreakdown(fundamentals);
      const sentimentResult = await this.sentimentAnalyzer.analyze(news);
      const { aggregatedScore, sentimentNormalized, shouldBuy } =
        this.decisionService.decide({
          technicalScore: techResult.score,
          fundamentalScore: fundResult.score,
          sentimentRaw: sentimentResult.score,
        });

      if (!shouldBuy) return;

      const priceTarget = this.priceTargetService.calculate(bars);
      const lastBar = bars[bars.length - 1];

      const partialRec: Omit<Recommendation, "narrative"> = {
        id: randomUUID(),
        ticker,
        date: lastBar.date,
        entryPrice: priceTarget.entryPrice,
        targetPrice: priceTarget.targetPrice,
        stopLoss: priceTarget.stopLoss,
        technicalScore: techResult.score.number,
        fundamentalScore: fundResult.score.number,
        sentimentScore: sentimentNormalized,
        aggregatedScore,
        sentimentJson: sentimentResult,
        winRateAtRecommendation: winRate,
        technicalBreakdown: techResult.breakdown,
        fundamentalBreakdown: fundResult.breakdown,
        status: "PENDING",
      };

      const narrative = await this.narrator.summarize(
        partialRec as Recommendation,
        winRate,
      );
      const recommendation: Recommendation = { ...partialRec, narrative };

      await this.repository.save(recommendation);
      result.recommended.push(ticker.raw);
    } catch (err) {
      result.errors.push(`Score ${ticker.raw}: ${String(err)}`);
    }
  }
}
