import { NextRequest, NextResponse } from "next/server";
import { YahooFinanceAdapter } from "../../../../adapters/outbound/yahoo-finance/YahooFinanceAdapter";
import { TechnicalScoringService } from "../../../../core/domain/services/TechnicalScoringService";
import {
  FundamentalScoringService,
  SectorMedians,
  median,
} from "../../../../core/domain/services/FundamentalScoringService";
import { Ticker } from "../../../../core/domain/value-objects/Ticker";
import { IDX80_TICKERS } from "../../../../lib/constants/idx80";

const BUY_THRESHOLD = 0.68; // matches DecisionService threshold
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const topN = Math.min(Number(searchParams.get("top") ?? "20"), 80);
  const singleTicker = searchParams.get("ticker")?.toUpperCase();

  const provider = new YahooFinanceAdapter();
  const technicalScorer = new TechnicalScoringService();
  const fundamentalScorer = new FundamentalScoringService();

  const tickerList = singleTicker
    ? [new Ticker(singleTicker)]
    : IDX80_TICKERS.map((t) => new Ticker(t));

  const fetchedAt = new Date().toISOString();

  // ----------------------------------------------------------------
  // Pass 1: Fetch all OHLCV + fundamentals in batches
  // ----------------------------------------------------------------
  type StockData = {
    ticker: Ticker;
    bars: Awaited<ReturnType<typeof provider.getHistoricalOHLCV>>;
    fundamentals: Awaited<ReturnType<typeof provider.getFundamentals>>;
  };

  const stockDataList: Array<StockData | { ticker: Ticker; error: string }> =
    [];

  for (let i = 0; i < tickerList.length; i += BATCH_SIZE) {
    const batch = tickerList.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (ticker) => {
        try {
          const [bars, fundamentals] = await Promise.all([
            provider.getHistoricalOHLCV(ticker, 120),
            provider.getFundamentals(ticker),
          ]);
          return { ticker, bars, fundamentals } as StockData;
        } catch (err) {
          return { ticker, error: String(err) };
        }
      }),
    );
    stockDataList.push(...batchResults);

    if (i + BATCH_SIZE < tickerList.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // ----------------------------------------------------------------
  // Pass 2: Compute sector medians — filter outliers (PE 3–100, PBV 0.1–30)
  // ----------------------------------------------------------------
  const sectorPEs = new Map<string, number[]>();
  const sectorPBVs = new Map<string, number[]>();
  for (const item of stockDataList) {
    if ("error" in item) continue;
    const s = item.fundamentals.sector ?? "Unknown";
    const pe = item.fundamentals.peRatio;
    const pbv = item.fundamentals.pbvRatio;
    if (pe != null && pe > 3 && pe < 100) {
      if (!sectorPEs.has(s)) sectorPEs.set(s, []);
      sectorPEs.get(s)!.push(pe);
    }
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

  // ----------------------------------------------------------------
  // Pass 3: Score with sector context
  // ----------------------------------------------------------------
  const results: Array<{
    ticker: string;
    technicalScore: number;
    fundamentalScore: number;
    estimatedAggregate: number;
    wouldBuy: boolean;
    lastBarDate: string | null;
    currentPrice: number | null;
    technicalBreakdown: unknown;
    fundamentalBreakdown: unknown;
    error?: string;
  }> = [];

  for (const item of stockDataList) {
    if ("error" in item) {
      results.push({
        ticker: item.ticker.raw,
        technicalScore: 0,
        fundamentalScore: 0,
        estimatedAggregate: 0,
        wouldBuy: false,
        lastBarDate: null,
        currentPrice: null,
        technicalBreakdown: null,
        fundamentalBreakdown: null,
        error: item.error,
      });
      continue;
    }

    const { ticker, bars, fundamentals } = item;
    const sectorCtx = sectorMediansMap.get(fundamentals.sector ?? "Unknown");

    const techResult = technicalScorer.scoreWithBreakdown(bars);
    const fundResult = fundamentalScorer.scoreWithBreakdown(
      fundamentals,
      sectorCtx,
      bars,
    );
    const estimated =
      0.4 * techResult.score.number + 0.4 * fundResult.score.number + 0.2 * 0.5; // sentiment assumed neutral

    const lastBar = bars[bars.length - 1] ?? null;
    const lastBarDate = lastBar
      ? lastBar.date instanceof Date
        ? lastBar.date.toISOString().slice(0, 10)
        : String(lastBar.date).slice(0, 10)
      : null;

    results.push({
      ticker: ticker.raw,
      technicalScore: Math.round(techResult.score.number * 1000) / 1000,
      fundamentalScore: Math.round(fundResult.score.number * 1000) / 1000,
      estimatedAggregate: Math.round(estimated * 1000) / 1000,
      wouldBuy: estimated >= BUY_THRESHOLD,
      lastBarDate,
      currentPrice: lastBar ? lastBar.close : null,
      technicalBreakdown: techResult.breakdown,
      fundamentalBreakdown: fundResult.breakdown,
    });
  }

  results.sort((a, b) => b.estimatedAggregate - a.estimatedAggregate);
  const top = results.slice(0, topN);
  const candidates = results.filter((r) => r.wouldBuy);
  const errors = results.filter((r) => r.error);

  // Find the most common lastBarDate to report as "data per tanggal"
  const dateCounts = results.reduce<Record<string, number>>((acc, r) => {
    if (r.lastBarDate) acc[r.lastBarDate] = (acc[r.lastBarDate] ?? 0) + 1;
    return acc;
  }, {});
  const latestDataDate =
    Object.entries(dateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return NextResponse.json({
    fetchedAt,
    latestDataDate,
    note: "Sentimen diasumsikan netral (0.5). Agregat aktual mungkin berbeda ±0.2",
    threshold: BUY_THRESHOLD,
    totalScored: results.length,
    candidatesAboveThreshold: candidates.length,
    errors: errors.length,
    top,
  });
}
