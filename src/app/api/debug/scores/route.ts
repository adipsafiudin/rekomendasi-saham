import { NextRequest, NextResponse } from "next/server";
import { YahooFinanceAdapter } from "../../../../adapters/outbound/yahoo-finance/YahooFinanceAdapter";
import { TechnicalScoringService } from "../../../../core/domain/services/TechnicalScoringService";
import { FundamentalScoringService } from "../../../../core/domain/services/FundamentalScoringService";
import { Ticker } from "../../../../core/domain/value-objects/Ticker";
import { IDX80_TICKERS } from "../../../../lib/constants/idx80";

const BUY_THRESHOLD = 0.75;
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

  for (let i = 0; i < tickerList.length; i += BATCH_SIZE) {
    const batch = tickerList.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (ticker) => {
        try {
          const [bars, fundamentals] = await Promise.all([
            provider.getHistoricalOHLCV(ticker, 120),
            provider.getFundamentals(ticker),
          ]);

          const techResult = technicalScorer.scoreWithBreakdown(bars);
          const fundResult = fundamentalScorer.scoreWithBreakdown(
            fundamentals,
            undefined,
            bars,
          );
          const estimated =
            0.4 * techResult.score.number +
            0.4 * fundResult.score.number +
            0.2 * 0.5;

          const lastBar = bars[bars.length - 1] ?? null;
          const lastBarDate = lastBar
            ? lastBar.date instanceof Date
              ? lastBar.date.toISOString().slice(0, 10)
              : String(lastBar.date).slice(0, 10)
            : null;

          return {
            ticker: ticker.raw,
            technicalScore: Math.round(techResult.score.number * 1000) / 1000,
            fundamentalScore: Math.round(fundResult.score.number * 1000) / 1000,
            estimatedAggregate: Math.round(estimated * 1000) / 1000,
            wouldBuy: estimated >= BUY_THRESHOLD,
            lastBarDate,
            currentPrice: lastBar ? lastBar.close : null,
            technicalBreakdown: techResult.breakdown,
            fundamentalBreakdown: fundResult.breakdown,
          };
        } catch (err) {
          return {
            ticker: ticker.raw,
            technicalScore: 0,
            fundamentalScore: 0,
            estimatedAggregate: 0,
            wouldBuy: false,
            lastBarDate: null,
            currentPrice: null,
            technicalBreakdown: null,
            fundamentalBreakdown: null,
            error: String(err),
          };
        }
      }),
    );
    results.push(...batchResults);

    if (i + BATCH_SIZE < tickerList.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
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
