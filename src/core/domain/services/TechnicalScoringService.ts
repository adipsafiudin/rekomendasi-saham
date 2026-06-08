import { OHLCVBar } from "../entities/Stock";
import { Score } from "../value-objects/Score";
import {
  RSI,
  MACD,
  BollingerBands,
  EMA,
  Stochastic,
  ADX,
  ATR,
  OBV,
} from "technicalindicators";

export interface TechnicalBreakdown {
  // Original
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
  // New: Stochastic
  stochK: number | null;
  stochD: number | null;
  stochScore: number;
  stochLabel: string;
  // New: OBV Accumulation
  obvSlope5: number;
  obvSlope20: number;
  accumulationScore: number;
  accumulationLabel: string;
  // New: ADX + Consolidation
  adx: number | null;
  consolidation: boolean;
  atrPct: number | null;
  breakoutScore: number;
  breakoutLabel: string;
  liquidityScore: number;
  liquidityLabel: string;
  avgTurnover20: number;
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
    const emptyBreakdown: TechnicalBreakdown = {
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
      stochK: null,
      stochD: null,
      stochScore: 0,
      stochLabel: "Data tidak cukup",
      obvSlope5: 0,
      obvSlope20: 0,
      accumulationScore: 0,
      accumulationLabel: "Data tidak cukup",
      adx: null,
      consolidation: false,
      atrPct: null,
      breakoutScore: 0,
      breakoutLabel: "Data tidak cukup",
      liquidityScore: 0,
      liquidityLabel: "Data tidak cukup",
      avgTurnover20: 0,
    };
    if (bars.length < 50) {
      return { score: new Score(0), breakdown: emptyBreakdown };
    }

    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const volumes = bars.map((b) => b.volume);
    const lastClose = closes[closes.length - 1];
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const lastVolume = volumes[volumes.length - 1];
    const avgTurnover20 =
      bars.slice(-20).reduce((sum, b) => sum + b.close * b.volume, 0) / 20;

    // --- RSI(14): IDX-friendly; rewards healthy momentum, not only pullbacks. ---
    const rsiValues = RSI.calculate({ period: 14, values: closes });
    const rsi = rsiValues[rsiValues.length - 1] ?? 50;
    let rsiScore = 0;
    let rsiLabel = "";
    if (rsi >= 45 && rsi <= 62) {
      rsiScore = 1.0;
      rsiLabel = `RSI ${rsi.toFixed(1)} - Momentum sehat (45-62)`;
    } else if (rsi >= 35 && rsi < 45) {
      rsiScore = 0.75;
      rsiLabel = `RSI ${rsi.toFixed(1)} - Pullback sehat, potensi rebound`;
    } else if (rsi > 62 && rsi <= 70) {
      rsiScore = 0.65;
      rsiLabel = `RSI ${rsi.toFixed(1)} - Momentum kuat, mulai panas`;
    } else if (rsi < 30) {
      rsiScore = 0.35;
      rsiLabel = `RSI ${rsi.toFixed(1)} - Oversold, tunggu konfirmasi`;
    } else if (rsi < 35) {
      rsiScore = 0.55;
      rsiLabel = `RSI ${rsi.toFixed(1)} - Mulai murah tapi momentum lemah`;
    } else {
      rsiScore = 0;
      rsiLabel = `RSI ${rsi.toFixed(1)} - Overbought (>70), risiko koreksi`;
    }

    // --- Stochastic(14,3,3): weight 15% ---
    const stochValues = Stochastic.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
      signalPeriod: 3,
    });
    const lastStoch = stochValues[stochValues.length - 1];
    const stochK = lastStoch?.k ?? null;
    const stochD = lastStoch?.d ?? null;
    let stochScore = 0;
    let stochLabel = "Stochastic — Data tidak cukup";
    if (stochK !== null && stochD !== null) {
      if (stochK < 20 && stochK > stochD) {
        stochScore = 1.0;
        stochLabel = `Stoch %K ${stochK.toFixed(1)} - Oversold & %K memotong ke atas, sinyal beli kuat`;
      } else if (stochK < 20) {
        stochScore = 0.8;
        stochLabel = `Stoch %K ${stochK.toFixed(1)} - Oversold, potensi pembalikan`;
      } else if (stochK < 40 && stochK > stochD) {
        stochScore = 0.6;
        stochLabel = `Stoch %K ${stochK.toFixed(1)} - Momentum naik dari zona rendah`;
      } else if (stochK >= 40 && stochK < 60) {
        stochScore = 0.4;
        stochLabel = `Stoch %K ${stochK.toFixed(1)} - Netral`;
      } else if (stochK >= 80) {
        stochScore = 0.0;
        stochLabel = `Stoch %K ${stochK.toFixed(1)} - Overbought, hindari beli`;
      } else {
        stochScore = 0.2;
        stochLabel = `Stoch %K ${stochK.toFixed(1)} - Di atas level ideal`;
      }
    }

    // --- MACD(12,26,9): weight 15% ---
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
        macdLabel = `MACD histogram +${lastMacd.histogram.toFixed(2)} & naik - Tren bullish kuat`;
      } else if (histPositive) {
        macdScore = 0.5;
        macdLabel = `MACD histogram positif tapi turun - Momentum melambat`;
      } else if (histRising) {
        macdScore = 0.5;
        macdLabel = `MACD histogram negatif tapi naik - Potensi reversal`;
      } else {
        macdScore = 0;
        macdLabel = `MACD histogram ${lastMacd.histogram.toFixed(2)} & turun - Bearish`;
      }
    }

    // --- Bollinger Bands(20,2): weight 10% ---
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
          bbLabel = `%B ${pctBPct}% - Harga di dekat lower band, oversold BB`;
        } else if (pctB <= 0.4) {
          bbScore = 0.75;
          bbLabel = `%B ${pctBPct}% - Harga di bawah tengah BB`;
        } else if (pctB <= 0.6) {
          bbScore = 0.5;
          bbLabel = `%B ${pctBPct}% - Harga di tengah BB`;
        } else if (pctB <= 0.8) {
          bbScore = 0.25;
          bbLabel = `%B ${pctBPct}% - Harga di atas tengah BB`;
        } else {
          bbScore = 0;
          bbLabel = `%B ${pctBPct}% - Harga di dekat upper band, overbought BB`;
        }
      }
    }

    // --- EMA20/EMA50 + Volume trend: weight 20% ---
    const ema20Values = EMA.calculate({ period: 20, values: closes });
    const ema50Values = EMA.calculate({ period: 50, values: closes });
    const ema20 = ema20Values[ema20Values.length - 1] ?? null;
    const ema50 = ema50Values[ema50Values.length - 1] ?? null;
    let trendScore = 0;
    let trendLabel = "Tren - tidak ada sinyal";
    if (ema20 && ema50 && lastClose > ema20 && ema20 > ema50) {
      if (lastVolume > avgVolume) {
        trendScore = 1.0;
        trendLabel =
          "Harga > EMA20 > EMA50 dengan volume naik - Tren bullish kuat";
      } else {
        trendScore = 0.75;
        trendLabel = "Harga > EMA20 > EMA50, volume normal - Tren bullish";
      }
    } else if (ema20 && ema50 && lastClose > ema20 && ema20 <= ema50) {
      trendScore = 0.55;
      trendLabel = "Harga kembali di atas EMA20 - Fase recovery awal";
    } else if (ema20 && ema50 && lastClose > ema50) {
      trendScore = 0.4;
      trendLabel = "Harga > EMA50 tapi di bawah EMA20 - Tren lemah/sideways";
    } else {
      trendLabel = "Harga di bawah EMA50 - Tren bearish";
    }

    // --- OBV Accumulation Signal: weight 25% ---
    const obvValues = OBV.calculate({ close: closes, volume: volumes });
    const recentOBV = obvValues.slice(-20);
    const obvRange = Math.max(...recentOBV) - Math.min(...recentOBV);
    const slope5 =
      recentOBV.length >= 5
        ? recentOBV[recentOBV.length - 1] - recentOBV[recentOBV.length - 5]
        : 0;
    const slope20 =
      recentOBV.length >= 20
        ? recentOBV[recentOBV.length - 1] - recentOBV[0]
        : 0;
    const normSlope5 = obvRange > 0 ? slope5 / obvRange : 0;
    const normSlope20 = obvRange > 0 ? slope20 / obvRange : 0;

    // ATR for consolidation detection
    const atrValues = ATR.calculate({
      period: 14,
      high: highs,
      low: lows,
      close: closes,
    });
    const atr = atrValues[atrValues.length - 1] ?? null;
    const atrPct = atr != null ? atr / lastClose : null;
    const consolidation =
      atrPct != null && atrPct < 0.015 && lastVolume >= avgVolume * 0.8;

    let accumulationScore = 0;
    let accumulationLabel = "";
    if (normSlope5 > 0.1 && normSlope20 > 0.05) {
      accumulationScore = 1.0;
      accumulationLabel = `OBV naik (jangka pendek +${(normSlope5 * 100).toFixed(0)}%, panjang +${(normSlope20 * 100).toFixed(0)}%) - Akumulasi kuat oleh pemain besar`;
    } else if (normSlope5 > 0.05) {
      accumulationScore = 0.75;
      accumulationLabel = `OBV mulai naik - Potensi akumulasi, perhatikan konfirmasi`;
    } else if (consolidation && normSlope5 >= -0.05) {
      accumulationScore = 0.6;
      accumulationLabel = `Harga konsolidasi ketat (ATR ${atrPct != null ? (atrPct * 100).toFixed(1) : "-"}%) dengan OBV stabil - Harga dijaga, siap bergerak`;
    } else if (normSlope5 < -0.1 && normSlope20 < -0.05) {
      accumulationScore = 0.0;
      accumulationLabel = `OBV turun konsisten - Distribusi, pemain besar keluar`;
    } else if (normSlope5 < -0.05) {
      accumulationScore = 0.25;
      accumulationLabel = `OBV melemah - Tekanan jual, waspadai distribusi`;
    } else {
      accumulationScore = 0.4;
      accumulationLabel = `OBV netral - Tidak ada sinyal akumulasi/distribusi jelas`;
    }

    // --- ADX(14): used as multiplier for trend clarity ---
    const adxValues = ADX.calculate({
      close: closes,
      high: highs,
      low: lows,
      period: 14,
    });
    const adxData = adxValues[adxValues.length - 1] as
      | { adx?: number }
      | undefined;
    const adx = adxData?.adx ?? null;

    const recent20High = Math.max(...bars.slice(-20).map((b) => b.high));
    const prior20High = Math.max(...bars.slice(-21, -1).map((b) => b.high));
    const nearHigh = recent20High > 0 ? lastClose / recent20High : 0;
    const volumeExpansion = avgVolume > 0 ? lastVolume / avgVolume : 0;
    let breakoutScore = 0;
    let breakoutLabel = "Breakout - tidak ada sinyal";
    if (lastClose >= prior20High && volumeExpansion >= 1.2) {
      breakoutScore = 1.0;
      breakoutLabel = `Breakout 20 hari dengan volume ${volumeExpansion.toFixed(1)}x rata-rata - Sinyal momentum kuat`;
    } else if (nearHigh >= 0.97 && volumeExpansion >= 0.9) {
      breakoutScore = 0.75;
      breakoutLabel = `Harga dekat high 20 hari (${(nearHigh * 100).toFixed(0)}%) - Momentum masih hidup`;
    } else if (nearHigh >= 0.92) {
      breakoutScore = 0.45;
      breakoutLabel = `Harga mulai mendekati resistance 20 hari - Perlu konfirmasi`;
    } else {
      breakoutScore = 0.15;
      breakoutLabel = "Belum dekat area breakout";
    }

    let liquidityScore = 0;
    let liquidityLabel = "Likuiditas - tidak memadai";
    if (avgTurnover20 >= 20_000_000_000) {
      liquidityScore = 1.0;
      liquidityLabel = `Rata-rata transaksi 20H Rp${(avgTurnover20 / 1_000_000_000).toFixed(1)}M - Sangat likuid`;
    } else if (avgTurnover20 >= 5_000_000_000) {
      liquidityScore = 0.8;
      liquidityLabel = `Rata-rata transaksi 20H Rp${(avgTurnover20 / 1_000_000_000).toFixed(1)}M - Likuid`;
    } else if (avgTurnover20 >= 1_000_000_000) {
      liquidityScore = 0.55;
      liquidityLabel = `Rata-rata transaksi 20H Rp${(avgTurnover20 / 1_000_000_000).toFixed(1)}M - Cukup, gunakan size kecil`;
    } else if (avgTurnover20 >= 250_000_000) {
      liquidityScore = 0.25;
      liquidityLabel = `Rata-rata transaksi 20H Rp${(avgTurnover20 / 1_000_000).toFixed(0)}jt - Tipis`;
    }

    // Weighted sum for Indonesia: trend, accumulation, liquidity, and breakout
    // matter more than pure oversold signals in many IDX momentum rotations.
    let raw =
      0.1 * rsiScore +
      0.08 * stochScore +
      0.14 * macdScore +
      0.08 * bbScore +
      0.22 * trendScore +
      0.18 * accumulationScore +
      0.12 * breakoutScore +
      0.08 * liquidityScore;

    // ADX multiplier: choppy markets lower conviction; clear trends get a small boost.
    if (adx !== null && adx < 15) {
      raw *= 0.9;
    } else if (adx !== null && adx >= 22 && trendScore >= 0.75) {
      raw *= 1.05;
    }

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
        stochK,
        stochD,
        stochScore,
        stochLabel,
        obvSlope5: normSlope5,
        obvSlope20: normSlope20,
        accumulationScore,
        accumulationLabel,
        adx,
        consolidation,
        atrPct,
        breakoutScore,
        breakoutLabel,
        liquidityScore,
        liquidityLabel,
        avgTurnover20,
      },
    };
  }
}
