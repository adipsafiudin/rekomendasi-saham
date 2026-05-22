import { Ticker } from "../../domain/value-objects/Ticker";
import { OHLCVBar, FundamentalData } from "../../domain/entities/Stock";
import { NewsItem } from "../../domain/entities/NewsItem";

export interface IStockDataProvider {
  getHistoricalOHLCV(ticker: Ticker, days: number): Promise<OHLCVBar[]>;
  getFundamentals(ticker: Ticker): Promise<FundamentalData>;
  getNews(ticker: Ticker): Promise<NewsItem[]>;
}
