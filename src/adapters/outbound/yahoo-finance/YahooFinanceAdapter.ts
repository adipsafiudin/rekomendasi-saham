import YahooFinance from "yahoo-finance2";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import type { SearchResult } from "yahoo-finance2/modules/search";
import { IStockDataProvider } from "../../../core/ports/outbound/IStockDataProvider";
import { Ticker } from "../../../core/domain/value-objects/Ticker";
import { OHLCVBar, FundamentalData } from "../../../core/domain/entities/Stock";
import { NewsItem } from "../../../core/domain/entities/NewsItem";

export class YahooFinanceAdapter implements IStockDataProvider {
  private yf = new YahooFinance();
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

    const summary = (await this.yf.quoteSummary(symbol, {
      modules: [
        "financialData",
        "defaultKeyStatistics",
        "assetProfile",
        "recommendationTrend",
      ],
    })) as unknown as QuoteSummaryResult & { [key: string]: any };

    const fin = summary.financialData;
    const stats = summary.defaultKeyStatistics;
    const profile = (summary as any).assetProfile;
    const trend = (summary as any).recommendationTrend;

    const currentPrice = fin?.currentPrice ?? null;
    const trailingEps =
      stats?.trailingEps != null ? (stats.trailingEps as number) : null;
    const priceToBook = stats?.priceToBook ?? null;
    const bookValuePerShare =
      currentPrice != null && priceToBook != null && priceToBook > 0
        ? currentPrice / priceToBook
        : null;

    // Analyst consensus: use most recent trend period (index 0 = current month)
    const latestTrend = trend?.trend?.[0];
    const analystBuy = (latestTrend?.strongBuy ?? 0) + (latestTrend?.buy ?? 0);
    const analystHold = latestTrend?.hold ?? 0;
    const analystSell =
      (latestTrend?.sell ?? 0) + (latestTrend?.strongSell ?? 0);

    return {
      peRatio:
        trailingEps != null && currentPrice != null && trailingEps !== 0
          ? currentPrice / trailingEps
          : null,
      pbvRatio: priceToBook,
      roe: fin?.returnOnEquity ?? null,
      // financialData.revenueGrowth = YoY TTM revenue growth (still updated by Yahoo Finance)
      revenueGrowth: fin?.revenueGrowth ?? null,
      debtToEquity: fin?.debtToEquity != null ? fin.debtToEquity / 100 : null,
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,
      currentPrice,
      trailingEps,
      bookValuePerShare,
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
