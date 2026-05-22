import { OHLCVBar } from "../entities/Stock";
import { PriceTarget } from "../value-objects/PriceTarget";
import { ATR } from "technicalindicators";

export class PriceTargetService {
  calculate(bars: OHLCVBar[]): PriceTarget {
    const lastBar = bars[bars.length - 1];
    const entryPrice = lastBar.close;

    // Target Price: max swing high in last 20 candles above current close
    const recent20 = bars.slice(-20);
    const swingHighs = recent20
      .map((b) => b.high)
      .filter((h) => h > entryPrice);
    const targetPrice =
      swingHighs.length > 0 ? Math.max(...swingHighs) : entryPrice * 1.05; // fallback: +5%

    // Stop Loss: entryPrice - ATR(14) × 1.5
    const atrInput = {
      high: bars.map((b) => b.high),
      low: bars.map((b) => b.low),
      close: bars.map((b) => b.close),
      period: 14,
    };
    const atrValues = ATR.calculate(atrInput);
    const atr = atrValues[atrValues.length - 1] ?? entryPrice * 0.02;
    const stopLoss = entryPrice - atr * 1.5;

    return { entryPrice, targetPrice, stopLoss };
  }
}
