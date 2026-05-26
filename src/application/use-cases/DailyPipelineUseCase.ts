import { randomUUID } from "crypto";
import { IStockDataProvider } from "../../core/ports/outbound/IStockDataProvider";
import { IRecommendationRepository } from "../../core/ports/outbound/IRecommendationRepository";
import { ISentimentAnalyzer } from "../../core/ports/outbound/ISentimentAnalyzer";
import { INarrator } from "../../core/ports/outbound/INarrator";
import { Ticker } from "../../core/domain/value-objects/Ticker";
import { TechnicalScoringService } from "../../core/domain/services/TechnicalScoringService";
import {
  FundamentalScoringService,
  SectorMedians,
  median,
} from "../../core/domain/services/FundamentalScoringService";
import { PriceTargetService } from "../../core/domain/services/PriceTargetService";
import { AuditService } from "../../core/domain/services/AuditService";
import { DecisionService } from "../../core/domain/services/DecisionService";
import { Recommendation } from "../../core/domain/entities/Recommendation";

const YAHOO_BATCH_SIZE = 10;
const YAHOO_BATCH_DELAY_MS = 1000;
// Delay between narrator calls (only runs for actual BUY candidates, typically 0-3/day)
const GROQ_INTER_TICKER_DELAY_MS = 2000;
// Pre-filter: only call Groq if tech+fund combined score can still reach BUY_THRESHOLD.
// Formula: 0.4*tech + 0.4*fund + 0.2*sentiment(max=1) >= 0.75 → pre-score >= 0.55
// Pre-filter: 0.4*tech + 0.4*fund + 0.2*sentiment(max=1) >= 0.68 → pre-score >= 0.48
const GROQ_PRESCORE_MIN = 0.48;

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

    // Step 2: Compute sector medians — filter outliers to prevent extreme PBV/PE
    // from corrupting the median (e.g. a single stock with PBV 2000x)
    const sectorPEs = new Map<string, number[]>();
    const sectorPBVs = new Map<string, number[]>();
    for (const data of stockDataList) {
      if (!data) continue;
      const s = data.fundamentals.sector ?? "Unknown";
      const pe = data.fundamentals.peRatio;
      const pbv = data.fundamentals.pbvRatio;
      // PE: only include sensible range (avoid loss-making and extreme growth distortion)
      if (pe != null && pe > 3 && pe < 100) {
        if (!sectorPEs.has(s)) sectorPEs.set(s, []);
        sectorPEs.get(s)!.push(pe);
      }
      // PBV: only include sensible range (cap at 30x; >30x is an outlier for IDX stocks)
      if (pbv != null && pbv > 0.1 && pbv < 30) {
        if (!sectorPBVs.has(s)) sectorPBVs.set(s, []);
        sectorPBVs.get(s)!.push(pbv);
      }
    }
    const sectorMediansMap = new Map<string, SectorMedians>();
    const allSectors = new Set([...sectorPEs.keys(), ...sectorPBVs.keys()]);
    for (const sector of allSectors) {
      sectorMediansMap.set(sector, {
        medianPE: median(sectorPEs.get(sector) ?? []),
        medianPBV: median(sectorPBVs.get(sector) ?? []),
      });
    }

    // Step 3: Pre-filter by tech+fund score — only run Groq on viable candidates
    const candidates: Array<{
      ticker: Ticker;
      bars: Awaited<ReturnType<IStockDataProvider["getHistoricalOHLCV"]>>;
      fundamentals: Awaited<ReturnType<IStockDataProvider["getFundamentals"]>>;
      news: Awaited<ReturnType<IStockDataProvider["getNews"]>>;
      techResult: ReturnType<TechnicalScoringService["scoreWithBreakdown"]>;
      fundResult: ReturnType<FundamentalScoringService["scoreWithBreakdown"]>;
    }> = [];

    for (const data of stockDataList) {
      if (!data) continue;
      const sectorCtx = sectorMediansMap.get(
        data.fundamentals.sector ?? "Unknown",
      );
      const techResult = this.technicalScorer.scoreWithBreakdown(data.bars);
      const fundResult = this.fundamentalScorer.scoreWithBreakdown(
        data.fundamentals,
        sectorCtx,
        data.bars,
      );
      const preScore =
        0.4 * techResult.score.number + 0.4 * fundResult.score.number;
      if (preScore < GROQ_PRESCORE_MIN) continue;
      candidates.push({ ...data, techResult, fundResult });
    }

    if (candidates.length === 0) return;

    // Step 4: ONE batch Groq call for sentiment across all candidates
    console.log(
      `[Pipeline] Running batch sentiment for ${candidates.length} candidates`,
    );
    const sentimentMap = await this.sentimentAnalyzer.analyzeBatch(
      candidates.map((c) => ({ ticker: c.ticker.raw, news: c.news })),
    );

    // Step 5: Decide + narrator (sequential, only for BUY candidates)
    for (const c of candidates) {
      const sentimentResult = sentimentMap.get(c.ticker.raw) ?? {
        score: 0,
        reasoning: "Missing from batch result",
      };
      const { aggregatedScore, sentimentNormalized, shouldBuy } =
        this.decisionService.decide({
          technicalScore: c.techResult.score,
          fundamentalScore: c.fundResult.score,
          sentimentRaw: sentimentResult.score,
        });

      if (!shouldBuy) continue;

      try {
        const priceTarget = this.priceTargetService.calculate(
          c.bars,
          c.fundResult.breakdown.fairValue,
        );
        const lastBar = c.bars[c.bars.length - 1];

        const partialRec: Omit<Recommendation, "narrative"> = {
          id: randomUUID(),
          ticker: c.ticker,
          date: lastBar.date,
          entryPrice: priceTarget.entryPrice,
          targetPrice: priceTarget.targetPrice,
          stopLoss: priceTarget.stopLoss,
          technicalScore: c.techResult.score.number,
          fundamentalScore: c.fundResult.score.number,
          sentimentScore: sentimentNormalized,
          aggregatedScore,
          sentimentJson: sentimentResult,
          winRateAtRecommendation: winRate,
          technicalBreakdown: c.techResult.breakdown,
          fundamentalBreakdown: c.fundResult.breakdown,
          status: "PENDING",
        };

        const narrative = await this.narrator.summarize(
          partialRec as Recommendation,
          winRate,
        );
        await this.repository.save({ ...partialRec, narrative });
        result.recommended.push(c.ticker.raw);

        // Delay only between narrator calls (BUY candidates only, typically 0-3)
        await new Promise((resolve) =>
          setTimeout(resolve, GROQ_INTER_TICKER_DELAY_MS),
        );
      } catch (err) {
        result.errors.push(`Score ${c.ticker.raw}: ${String(err)}`);
      }
    }
  }
}
