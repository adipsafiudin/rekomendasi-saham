import { OHLCVBar } from "../entities/Stock";
import { Score } from "../value-objects/Score";
import { RSI, MACD, BollingerBands, EMA } from "technicalindicators";

export interface TechnicalBreakdown {
  rsi: number | null;
  rsiScore: number;
  rsiLabel: string;
  macdHistogram: number | null;
  macdScore: number;
  macdLabel: string;
  pctB: number | null;
  bbScore: number;
  bbLabel: string;
  ema20: number | null;
  ema50: number | null;
  lastClose: number | null;
  trendScore: number;
  trendLabel: string;
}

export interface TechnicalResult {
  score: Score;
  breakdown: TechnicalBreakdown;
}

export class TechnicalScoringService {
  score(bars: OHLCVBar[]): Score {
    return this.scoreWithBreakdown(bars).score;
  }

  scoreWithBreakdown(bars: OHLCVBar[]): TechnicalResult {
    if (bars.length < 50) {
      return {
        score: new Score(0),
        breakdown: {
          rsi: null,
          rsiScore: 0,
          rsiLabel: "Data tidak cukup (< 50 bar)",
          macdHistogram: null,
          macdScore: 0,
          macdLabel: "Data tidak cukup",
          pctB: null,
          bbScore: 0,
          bbLabel: "Data tidak cukup",
          ema20: null,
          ema50: null,
          lastClose: null,
          trendScore: 0,
          trendLabel: "Data tidak cukup",
        },
      };
    }

    const closes = bars.map((b) => b.close);
    const volumes = bars.map((b) => b.volume);
    const lastClose = closes[closes.length - 1];

    // --- RSI(14): buy zone 30-50 = 1.0 ---
    const rsiValues = RSI.calculate({ period: 14, values: closes });
    const rsi = rsiValues[rsiValues.length - 1] ?? 50;
    let rsiScore = 0;
    let rsiLabel = "";
    if (rsi >= 30 && rsi <= 50) {
      rsiScore = 1.0;
      rsiLabel = `RSI ${rsi.toFixed(1)} — Zona beli ideal (30-50)`;
    } else if (rsi > 50 && rsi <= 60) {
      rsiScore = 0.75;
      rsiLabel = `RSI ${rsi.toFixed(1)} — Momentum positif (50-60)`;
    } else if (rsi > 60 && rsi <= 70) {
      rsiScore = 0.4;
      rsiLabel = `RSI ${rsi.toFixed(1)} — Mendekati overbought (60-70)`;
    } else if (rsi < 30) {
      rsiScore = 0.5;
      rsiLabel = `RSI ${rsi.toFixed(1)} — Oversold, potensi reversal`;
    } else {
      rsiScore = 0;
      rsiLabel = `RSI ${rsi.toFixed(1)} — Overbought (>70), hindari beli`;
    }

    // --- MACD(12,26,9): histogram positif & naik = 1.0 ---
    const macdResult = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const lastMacd = macdResult[macdResult.length - 1];
    const prevMacd = macdResult[macdResult.length - 2];
    let macdScore = 0;
    let macdLabel = "MACD — Data tidak cukup";
    const macdHist = lastMacd?.histogram ?? null;
    if (lastMacd?.histogram != null && prevMacd?.histogram != null) {
      const histPositive = lastMacd.histogram > 0;
      const histRising = lastMacd.histogram > prevMacd.histogram;
      if (histPositive && histRising) {
        macdScore = 1.0;
        macdLabel = `MACD histogram +${lastMacd.histogram.toFixed(2)} & naik — Tren bullish kuat`;
      } else if (histPositive) {
        macdScore = 0.5;
        macdLabel = `MACD histogram positif tapi turun — Momentum melambat`;
      } else if (histRising) {
        macdScore = 0.5;
        macdLabel = `MACD histogram negatif tapi naik — Potensi reversal`;
      } else {
        macdScore = 0;
        macdLabel = `MACD histogram ${lastMacd.histogram.toFixed(2)} & turun — Bearish`;
      }
    }

    // --- Bollinger Bands(20,2): harga dekat lower band = beli ---
    const bbResult = BollingerBands.calculate({
      period: 20,
      values: closes,
      stdDev: 2,
    });
    const lastBB = bbResult[bbResult.length - 1];
    let bbScore = 0;
    let bbLabel = "BB — Data tidak cukup";
    let pctB: number | null = null;
    if (lastBB) {
      const bandwidth = lastBB.upper - lastBB.lower;
      if (bandwidth > 0) {
        pctB = (lastClose - lastBB.lower) / bandwidth;
        const pctBPct = (pctB * 100).toFixed(0);
        if (pctB <= 0.2) {
          bbScore = 1.0;
          bbLabel = `%B ${pctBPct}% — Harga di dekat lower band, oversold BB`;
        } else if (pctB <= 0.4) {
          bbScore = 0.75;
          bbLabel = `%B ${pctBPct}% — Harga di bawah tengah BB`;
        } else if (pctB <= 0.6) {
          bbScore = 0.5;
          bbLabel = `%B ${pctBPct}% — Harga di tengah BB`;
        } else if (pctB <= 0.8) {
          bbScore = 0.25;
          bbLabel = `%B ${pctBPct}% — Harga di atas tengah BB`;
        } else {
          bbScore = 0;
          bbLabel = `%B ${pctBPct}% — Harga di dekat upper band, overbought BB`;
        }
      }
    }

    // --- EMA20/EMA50 + Volume trend ---
    const ema20Values = EMA.calculate({ period: 20, values: closes });
    const ema50Values = EMA.calculate({ period: 50, values: closes });
    const ema20 = ema20Values[ema20Values.length - 1] ?? null;
    const ema50 = ema50Values[ema50Values.length - 1] ?? null;
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const lastVolume = volumes[volumes.length - 1];
    let trendScore = 0;
    let trendLabel = "Tren — tidak ada sinyal";
    if (ema20 && ema50 && lastClose > ema20 && ema20 > ema50) {
      if (lastVolume > avgVolume) {
        trendScore = 1.0;
        trendLabel =
          "Harga > EMA20 > EMA50 dengan volume naik — Tren bullish kuat";
      } else {
        trendScore = 0.75;
        trendLabel = "Harga > EMA20 > EMA50, volume normal — Tren bullish";
      }
    } else if (ema20 && ema50 && lastClose > ema50) {
      trendScore = 0.4;
      trendLabel = "Harga > EMA50 tapi di bawah EMA20 — Tren lemah/sideways";
    } else {
      trendLabel = "Harga di bawah EMA50 — Tren bearish";
    }

    // Weighted: RSI 25% + MACD 25% + BB 25% + Trend 25%
    const raw =
      0.25 * rsiScore + 0.25 * macdScore + 0.25 * bbScore + 0.25 * trendScore;
    return {
      score: new Score(Math.min(1, Math.max(0, raw))),
      breakdown: {
        rsi,
        rsiScore,
        rsiLabel,
        macdHistogram: macdHist,
        macdScore,
        macdLabel,
        pctB,
        bbScore,
        bbLabel,
        ema20,
        ema50,
        lastClose,
        trendScore,
        trendLabel,
      },
    };
  }
}
