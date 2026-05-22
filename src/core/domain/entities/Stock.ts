import { Ticker } from "../value-objects/Ticker";

export interface OHLCVBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FundamentalData {
  peRatio: number | null;
  pbvRatio: number | null;
  roe: number | null; // Return on Equity (decimal, e.g. 0.15 = 15%)
  revenueGrowth: number | null; // YoY revenue growth (decimal)
  debtToEquity: number | null;
}

export interface Stock {
  ticker: Ticker;
  ohlcv: OHLCVBar[];
  fundamentals: FundamentalData;
}
