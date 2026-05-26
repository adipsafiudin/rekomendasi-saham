import { OHLCVBar } from "../entities/Stock";
import { PriceTarget } from "../value-objects/PriceTarget";
import { ATR } from "technicalindicators";

export class PriceTargetService {
  /**
   * Calculate entry, target, and stop-loss prices.
   * @param bars   OHLCV history (at least 60 bars recommended)
   * @param fairValue  Optional blended fair value from FundamentalScoringService —
   *                   used as an additional ceiling for the target price.
   */
  calculate(bars: OHLCVBar[], fairValue?: number | null): PriceTarget {
    const lastBar = bars[bars.length - 1];
    const entryPrice = lastBar.close;

    // --- Stop Loss: entryPrice - ATR(14) × 1.5 ---
    const atrValues = ATR.calculate({
      high: bars.map((b) => b.high),
      low: bars.map((b) => b.low),
      close: bars.map((b) => b.close),
      period: 14,
    });
    const atr = atrValues[atrValues.length - 1] ?? entryPrice * 0.02;
    const stopLoss = entryPrice - atr * 1.5;

    // --- Target Price: multi-method ---
    // Method 1: 60-day resistance (max high across last 60 bars)
    const recent60 = bars.slice(-60);
    const resistance60d = Math.max(...recent60.map((b) => b.high));

    // Method 2: Fibonacci 1.272 extension from recent 15-bar swing low
    const recent15Lows = bars.slice(-15).map((b) => b.low);
    const swingLow = Math.min(...recent15Lows);
    const fibTarget = entryPrice + (entryPrice - swingLow) * 1.272;

    // Conservative target = min(resistance, fibonacci extension)
    let rawTarget = Math.min(resistance60d, fibTarget);

    // Method 3: Fair value ceiling — if fair value is between entry and raw target,
    // cap at fair value to avoid targeting unrealistic premium zones
    if (fairValue != null && fairValue > entryPrice && fairValue < rawTarget) {
      rawTarget = fairValue;
    }

    // Hard cap at +25% upside from entry (guards against low-liquidity outliers)
    rawTarget = Math.min(rawTarget, entryPrice * 1.25);

    // Floor at +5% — if all methods yield a target too close to entry, use +10% fallback
    if (rawTarget <= entryPrice * 1.02) {
      rawTarget = entryPrice * 1.1;
    }

    return { entryPrice, targetPrice: rawTarget, stopLoss };
  }
}
