import YahooFinance from "yahoo-finance2";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import type { SearchResult } from "yahoo-finance2/modules/search";
import { IStockDataProvider } from "../../../core/ports/outbound/IStockDataProvider";
import { Ticker } from "../../../core/domain/value-objects/Ticker";
import { OHLCVBar, FundamentalData } from "../../../core/domain/entities/Stock";
import { NewsItem } from "../../../core/domain/entities/NewsItem";

export class YahooFinanceAdapter implements IStockDataProvider {
  private yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  async getHistoricalOHLCV(ticker: Ticker, days: number): Promise<OHLCVBar[]> {
    const symbol = ticker.toYahooSymbol();
    // Add 2-day buffer so Yahoo Finance includes the most recent completed trading day
    const period2 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const period1 = new Date();
    period1.setDate(period1.getDate() - days);

    const result = (await this.yf.chart(symbol, {
      period1,
      period2,
      interval: "1d",
      return: "array" as const,
    })) as unknown as ChartResultArray;

    // Yahoo Finance API sometimes returns close=null for the most recent bar even after
    // market close (data processing lag). Fall back to meta.regularMarketPrice in that case.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaClose: number | null =
      (result as any).meta?.regularMarketPrice ?? null;
    const quotes = result.quotes.filter((q) => q.open != null);

    return quotes
      .map((q, i) => {
        const close = q.close ?? (i === quotes.length - 1 ? metaClose : null);
        if (close == null) return null;
        const jakartaDate = (q.date as Date).toLocaleDateString("sv", {
          timeZone: "Asia/Jakarta",
        });
        return {
          date: new Date(jakartaDate + "T00:00:00.000Z"),
          open: (q.open ?? close) as number,
          high: (q.high ?? close) as number,
          low: (q.low ?? close) as number,
          close,
          volume: (q.volume ?? 0) as number,
        };
      })
      .filter((bar): bar is OHLCVBar => bar !== null);
  }

  async getFundamentals(ticker: Ticker): Promise<FundamentalData> {
    const symbol = ticker.toYahooSymbol();

    // Fetch core modules with normal validation.
    const summary = (await this.yf.quoteSummary(symbol, {
      modules: [
        "financialData",
        "defaultKeyStatistics",
        "assetProfile",
        "recommendationTrend",
        "summaryDetail", // 52-week range, trailingPE
      ],
    })) as unknown as QuoteSummaryResult & { [key: string]: any };

    // Fetch earnings separately with validation disabled.
    // The `earnings` module triggers FailedYahooValidationError for many IDX
    // stocks (non-fatal schema differences in Yahoo's response). The data itself
    // is valid — we just need to bypass the strict json-schema check.
    const earningsSummary = (await this.yf
      .quoteSummary(
        symbol,
        { modules: ["earnings"] },
        { validateResult: false },
      )
      .catch(() => null)) as any;

    const fin = (summary as any).financialData;
    const stats = (summary as any).defaultKeyStatistics;
    const profile = (summary as any).assetProfile;
    const trend = (summary as any).recommendationTrend;
    const detail = (summary as any).summaryDetail;

    // Annual revenue/earnings chart — 4 years, sorted ascending by year.
    // More reliable than the deprecated balance sheet / income statement modules.
    type YearlyRow = {
      date: number;
      revenue: number;
      earnings: number;
      profitMargin: number;
    };
    const yearlyChart: YearlyRow[] =
      earningsSummary?.earnings?.financialsChart?.yearly ?? [];

    const currentPrice: number | null = fin?.currentPrice ?? null;

    // ── Shares outstanding ───────────────────────────────────────────────────
    const sharesOutstanding: number | null =
      (stats?.sharesOutstanding as number | null | undefined) ?? null;

    // ── EPS ─────────────────────────────────────────────────────────────────
    // Prefer Yahoo's cached trailingEps.
    // Fallback: most recent annual earnings / shares (from yearly chart).
    const latestEarningsYear = [...yearlyChart]
      .reverse()
      .find((y) => y.earnings !== 0);
    const epsFromChart: number | null =
      latestEarningsYear != null &&
      sharesOutstanding != null &&
      sharesOutstanding > 0
        ? latestEarningsYear.earnings / sharesOutstanding
        : null;
    const trailingEps: number | null =
      stats?.trailingEps != null && (stats.trailingEps as number) !== 0
        ? (stats.trailingEps as number)
        : epsFromChart;

    // ── Book Value Per Share ─────────────────────────────────────────────────
    // defaultKeyStatistics.bookValue IS BVPS directly — most reliable source.
    const rawBookValue: number | null =
      stats?.bookValue != null && (stats.bookValue as number) > 0
        ? (stats.bookValue as number)
        : null;

    // Compute PBV from actual BVPS (more accurate than Yahoo's cached priceToBook)
    const pbvFromBook: number | null =
      rawBookValue != null && currentPrice != null && currentPrice > 0
        ? currentPrice / rawBookValue
        : null;
    const rawPBV: number | null =
      pbvFromBook ?? (stats?.priceToBook as number | null | undefined) ?? null;
    // Sanity cap: PBV > 50 for an IDX blue-chip is almost certainly a data error
    const pbvRatio: number | null =
      rawPBV != null && rawPBV > 0 && rawPBV <= 50 ? rawPBV : null;
    const bookValuePerShare: number | null =
      rawBookValue ??
      (pbvRatio != null && currentPrice != null && currentPrice > 0
        ? currentPrice / pbvRatio
        : null);

    // ── PE Ratio ─────────────────────────────────────────────────────────────
    const trailingPE: number | null =
      (detail?.trailingPE as number | null | undefined) ?? null;
    const peRatio: number | null =
      trailingEps != null && currentPrice != null && trailingEps > 0
        ? currentPrice / trailingEps
        : trailingPE != null && trailingPE > 0 && trailingPE < 200
          ? trailingPE
          : null;

    // ── Revenue Growth YoY ──────────────────────────────────────────────────
    // Primary: Yahoo's pre-computed value (TTM basis).
    // Fallback: YoY from the two most recent years with positive revenue in the
    // earnings chart. Revenue = 0 or negative indicates a holding company year
    // where earnings come from investment returns, not operating revenue — skip.
    const revenueGrowthCalc: number | null = (() => {
      const valid = yearlyChart.filter((y) => y.revenue > 0);
      if (valid.length < 2) return null;
      const latest = valid[valid.length - 1];
      const prior = valid[valid.length - 2];
      return (latest.revenue - prior.revenue) / Math.abs(prior.revenue);
    })();
    const revenueGrowth: number | null =
      (fin?.revenueGrowth as number | null | undefined) ?? revenueGrowthCalc;

    // ── Earnings Growth YoY ─────────────────────────────────────────────────
    const earningsGrowthCalc: number | null = (() => {
      if (yearlyChart.length < 2) return null;
      const latest = yearlyChart[yearlyChart.length - 1];
      const prior = yearlyChart[yearlyChart.length - 2];
      if (prior.earnings === 0) return null;
      return (latest.earnings - prior.earnings) / Math.abs(prior.earnings);
    })();
    const earningsGrowth: number | null =
      (fin?.earningsGrowth as number | null | undefined) ?? earningsGrowthCalc;

    // ── Profit Margin ────────────────────────────────────────────────────────
    // Primary: Yahoo's TTM profitMargins.
    // Fallback: most recent annual profitMargin from earnings chart where
    // revenue > 0 (avoids years where holding companies report zero revenue).
    const profitMarginCalc: number | null = (() => {
      const valid = [...yearlyChart]
        .reverse()
        .find((y) => y.revenue > 0 && y.profitMargin !== 0);
      return valid?.profitMargin ?? null;
    })();
    const profitMargin: number | null =
      (fin?.profitMargins as number | null | undefined) ?? profitMarginCalc;

    // ── ROE ──────────────────────────────────────────────────────────────────
    const roe: number | null =
      (fin?.returnOnEquity as number | null | undefined) ?? null;

    // ── Debt-to-Equity ───────────────────────────────────────────────────────
    // Yahoo financialData.debtToEquity is in percentage form (e.g. 150.5 = 1.505×).
    // It is null for banks (expected — banks use capital adequacy ratios instead).
    const debtToEquity: number | null =
      fin?.debtToEquity != null ? (fin.debtToEquity as number) / 100 : null;

    // ── 52-Week Range ────────────────────────────────────────────────────────
    const fiftyTwoWeekHigh: number | null =
      (detail?.fiftyTwoWeekHigh as number | null | undefined) ?? null;
    const fiftyTwoWeekLow: number | null =
      (detail?.fiftyTwoWeekLow as number | null | undefined) ?? null;

    // ── Analyst consensus ────────────────────────────────────────────────────
    const latestTrend = trend?.trend?.[0];
    const analystBuy = (latestTrend?.strongBuy ?? 0) + (latestTrend?.buy ?? 0);
    const analystHold = latestTrend?.hold ?? 0;
    const analystSell =
      (latestTrend?.sell ?? 0) + (latestTrend?.strongSell ?? 0);

    return {
      peRatio,
      pbvRatio,
      roe,
      revenueGrowth,
      earningsGrowth,
      profitMargin,
      debtToEquity,
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,
      currentPrice,
      trailingEps,
      bookValuePerShare,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
      analystBuy,
      analystHold,
      analystSell,
    };
  }

  async getNews(ticker: Ticker): Promise<NewsItem[]> {
    const symbol = ticker.toYahooSymbol();

    const result = (await this.yf.search(symbol, {
      newsCount: 10,
      quotesCount: 0,
    })) as unknown as SearchResult;

    return result.news.map((n) => ({
      headline: n.title,
      publishedAt: n.providerPublishTime, // already a Date in yahoo-finance2
      url: n.link,
      source: n.publisher,
    }));
  }
}
