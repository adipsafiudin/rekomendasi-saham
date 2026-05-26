import { FundamentalData, OHLCVBar } from "../entities/Stock";
import { Score } from "../value-objects/Score";

// ============================================================
// Interfaces
// ============================================================

export interface SectorMedians {
  medianPE: number | null;
  medianPBV: number | null;
}

export interface FundamentalBreakdown {
  // Core metrics
  pe: number | null;
  peScore: number | null;
  peLabel: string;
  pbv: number | null;
  pbvScore: number | null;
  pbvLabel: string;
  roe: number | null;
  roeScore: number | null;
  roeLabel: string;
  revenueGrowth: number | null;
  revenueGrowthScore: number | null;
  revenueGrowthLabel: string;
  debtToEquity: number | null;
  deScore: number | null;
  deLabel: string;

  // Additional quality metrics (informational)
  earningsGrowth: number | null;
  profitMargin: number | null;

  // Stock type detection
  isConglomerate: boolean;
  isBank: boolean;

  // Valuation context
  sector: string | null;
  industry: string | null;
  currentPrice: number | null;
  trailingEps: number | null;
  bookValuePerShare: number | null;

  // Sector comparison
  sectorMedianPE: number | null;
  sectorMedianPBV: number | null;
  peRelative: number | null;
  pbvRelative: number | null;
  relValScore: number | null;
  relValLabel: string;

  // Historical price analysis
  price52wHigh: number | null; // from Yahoo Finance 52W range (preferred) or OHLCV
  price52wLow: number | null;
  pricePosition52w: number | null;
  historicalMeanPrice: number | null; // from OHLCV bars
  priceHistScore: number | null;
  priceHistLabel: string;

  // Fair value
  fairValue: number | null;
  fairValueMethod: string;
  marginOfSafety: number | null;
  grahamNumber: number | null;
  peerFairValue: number | null; // legacy: primary peer-based estimate
  peerFairValuePE: number | null; // EPS × sectorMedianPE
  peerFairValuePBV: number | null; // BVPS × sectorMedianPBV
  histFairValue: number | null;
  mosScore: number | null; // Margin of Safety scored 0-1
  mosLabel: string;

  // Analyst consensus
  analystBuy: number;
  analystHold: number;
  analystSell: number;
  analystScore: number | null;
  analystLabel: string;
}

export interface FundamentalResult {
  score: Score;
  breakdown: FundamentalBreakdown;
}

// ============================================================
// Helpers
// ============================================================

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function detectConglomerate(industry: string | null): boolean {
  if (!industry) return false;
  const lower = industry.toLowerCase();
  return (
    lower.includes("conglomerate") ||
    lower.includes("holding") ||
    lower.includes("multi-sector") ||
    lower.includes("diversified")
  );
}

function detectBank(sector: string | null, industry: string | null): boolean {
  const s = (sector ?? "").toLowerCase();
  const i = (industry ?? "").toLowerCase();
  return (
    s.includes("financial") ||
    i.includes("bank") ||
    i.includes("insurance") ||
    i.includes("finance")
  );
}

// ============================================================
// Service
// ============================================================

export class FundamentalScoringService {
  score(
    fundamentals: FundamentalData,
    sectorContext?: SectorMedians,
    bars?: OHLCVBar[],
  ): Score {
    return this.scoreWithBreakdown(fundamentals, sectorContext, bars).score;
  }

  scoreWithBreakdown(
    fundamentals: FundamentalData,
    sectorContext?: SectorMedians,
    bars?: OHLCVBar[],
  ): FundamentalResult {
    const metrics: { score: number; weight: number }[] = [];

    const isConglomerate = detectConglomerate(fundamentals.industry);
    const isBank = detectBank(fundamentals.sector, fundamentals.industry);

    // ----------------------------------------------------------
    // 1. Historical price analysis (weight 10%)
    // Prefer Yahoo Finance's 52-week range (full rolling year) over OHLCV window
    // (120 bars ≈ 6 months, so OHLCV window undershoots the true 1-year range)
    // ----------------------------------------------------------
    const closes = bars ? bars.map((b) => b.close) : [];
    const historicalMeanPrice =
      closes.length > 0
        ? closes.reduce((a, b) => a + b, 0) / closes.length
        : null;
    const currentPrice = fundamentals.currentPrice;

    // Prefer Yahoo's 52-week data; fall back to OHLCV-derived window
    const price52wHigh =
      fundamentals.fiftyTwoWeekHigh ??
      (closes.length > 0 ? Math.max(...closes) : null);
    const price52wLow =
      fundamentals.fiftyTwoWeekLow ??
      (closes.length > 0 ? Math.min(...closes) : null);

    let pricePosition52w: number | null = null;
    if (
      price52wHigh != null &&
      price52wLow != null &&
      currentPrice != null &&
      price52wHigh > price52wLow
    ) {
      pricePosition52w =
        (currentPrice - price52wLow) / (price52wHigh - price52wLow);
    }

    let priceHistScore: number | null = null;
    let priceHistLabel = "Posisi Harga Historis — Data tidak cukup";
    if (pricePosition52w !== null) {
      const pct = pricePosition52w;
      const pos = (pct * 100).toFixed(0);
      const source =
        fundamentals.fiftyTwoWeekHigh != null ? "52W Yahoo" : "120H OHLCV";
      if (pct <= 0.2) {
        priceHistScore = 1.0;
        priceHistLabel = `Harga di ${pos}% kisaran ${source} — Dekat titik terendah, historis murah`;
      } else if (pct <= 0.4) {
        priceHistScore = 0.75;
        priceHistLabel = `Harga di ${pos}% kisaran ${source} — Di bawah rata-rata historis`;
      } else if (pct <= 0.6) {
        priceHistScore = 0.5;
        priceHistLabel = `Harga di ${pos}% kisaran ${source} — Mendekati rata-rata historis`;
      } else if (pct <= 0.8) {
        priceHistScore = 0.25;
        priceHistLabel = `Harga di ${pos}% kisaran historis — Di atas rata-rata historis`;
      } else {
        priceHistScore = 0.0;
        priceHistLabel = `Harga di ${pos}% kisaran historis — Mendekati titik tertinggi, historis mahal`;
      }
      metrics.push({ score: priceHistScore, weight: 10 }); // reduced 15→10%
    }

    // ----------------------------------------------------------
    // 2. ROE — profitability (weight 20%)
    // ----------------------------------------------------------
    let roeScore: number | null = null;
    let roeLabel = "ROE — Tidak tersedia";
    if (fundamentals.roe !== null) {
      const roe = fundamentals.roe;
      const [t1, t2, t3, t4] = isBank
        ? [0.15, 0.12, 0.08, 0.04]
        : [0.2, 0.15, 0.1, 0.05];
      if (roe >= t1) {
        roeScore = 1.0;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Sangat efisien`;
      } else if (roe >= t2) {
        roeScore = 0.75;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Efisien`;
      } else if (roe >= t3) {
        roeScore = 0.5;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Cukup baik`;
      } else if (roe >= t4) {
        roeScore = 0.25;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Rendah`;
      } else {
        roeScore = 0;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Sangat rendah atau rugi`;
      }
      metrics.push({ score: roeScore, weight: 15 }); // reduced 20→15%
    }

    // ----------------------------------------------------------
    // 3. Revenue Growth YoY (weight 15%)
    // ----------------------------------------------------------
    let revenueGrowthScore: number | null = null;
    let revenueGrowthLabel = "Revenue Growth — Tidak tersedia";
    if (fundamentals.revenueGrowth !== null) {
      const rg = fundamentals.revenueGrowth;
      if (rg >= 0.2) {
        revenueGrowthScore = 1.0;
        revenueGrowthLabel = `Revenue Growth +${(rg * 100).toFixed(1)}% — Pertumbuhan kuat`;
      } else if (rg >= 0.1) {
        revenueGrowthScore = 0.75;
        revenueGrowthLabel = `Revenue Growth +${(rg * 100).toFixed(1)}% — Pertumbuhan baik`;
      } else if (rg >= 0.05) {
        revenueGrowthScore = 0.5;
        revenueGrowthLabel = `Revenue Growth +${(rg * 100).toFixed(1)}% — Pertumbuhan lambat`;
      } else if (rg >= 0) {
        revenueGrowthScore = 0.25;
        revenueGrowthLabel = `Revenue Growth +${(rg * 100).toFixed(1)}% — Stagnan`;
      } else {
        revenueGrowthScore = 0;
        revenueGrowthLabel = `Revenue Growth ${(rg * 100).toFixed(1)}% — Penurunan pendapatan`;
      }
      metrics.push({ score: revenueGrowthScore, weight: 10 }); // reduced 15→10%
    }

    // ----------------------------------------------------------
    // 4a. P/E (weight 15%) — relative-to-sector first, absolute fallback
    // ----------------------------------------------------------
    const sectorMedianPE = sectorContext?.medianPE ?? null;
    const sectorMedianPBV = sectorContext?.medianPBV ?? null;

    const peRelative =
      fundamentals.peRatio != null &&
      fundamentals.peRatio > 0 &&
      sectorMedianPE != null
        ? fundamentals.peRatio / sectorMedianPE
        : null;
    const pbvRelative =
      fundamentals.pbvRatio != null &&
      fundamentals.pbvRatio > 0 &&
      sectorMedianPBV != null
        ? fundamentals.pbvRatio / sectorMedianPBV
        : null;

    let peScore: number | null = null;
    let peLabel = "P/E — Tidak tersedia";
    if (fundamentals.peRatio !== null) {
      const pe = fundamentals.peRatio;
      if (peRelative !== null) {
        if (peRelative <= 0.6) {
          peScore = 1.0;
          peLabel = `P/E ${pe.toFixed(1)}x — ${(peRelative * 100).toFixed(0)}% dari median sektor, jauh lebih murah dari peers`;
        } else if (peRelative <= 0.8) {
          peScore = 0.8;
          peLabel = `P/E ${pe.toFixed(1)}x — ${(peRelative * 100).toFixed(0)}% dari median sektor, lebih murah dari peers`;
        } else if (peRelative <= 1.0) {
          peScore = 0.6;
          peLabel = `P/E ${pe.toFixed(1)}x — Sesuai rata-rata sektor (median: ${sectorMedianPE!.toFixed(1)}x)`;
        } else if (peRelative <= 1.3) {
          peScore = 0.3;
          peLabel = `P/E ${pe.toFixed(1)}x — ${((peRelative - 1) * 100).toFixed(0)}% lebih mahal dari sektor`;
        } else {
          peScore = 0.1;
          peLabel = `P/E ${pe.toFixed(1)}x — Jauh lebih mahal dari sektor (${(peRelative * 100).toFixed(0)}%)`;
        }
      } else if (pe > 0) {
        const [cheap, fair, pricey, expensive] = isBank
          ? [10, 15, 20, 30]
          : isConglomerate
            ? [8, 12, 18, 25]
            : [10, 15, 20, 25];
        if (pe <= cheap) {
          peScore = 1.0;
          peLabel = `P/E ${pe.toFixed(1)}x — Sangat murah${isBank ? " (standar perbankan)" : ""}`;
        } else if (pe <= fair) {
          peScore = 0.75;
          peLabel = `P/E ${pe.toFixed(1)}x — Murah`;
        } else if (pe <= pricey) {
          peScore = 0.5;
          peLabel = `P/E ${pe.toFixed(1)}x — Wajar`;
        } else if (pe <= expensive) {
          peScore = 0.25;
          peLabel = `P/E ${pe.toFixed(1)}x — Sedikit mahal`;
        } else {
          peScore = 0.1;
          peLabel = `P/E ${pe.toFixed(1)}x — Mahal (>${expensive}x)`;
        }
      } else {
        peScore = 0;
        peLabel = `P/E negatif — Perusahaan merugi`;
      }
      metrics.push({ score: peScore, weight: 10 }); // reduced 15→10%
    }

    // ----------------------------------------------------------
    // 4b. P/BV (weight 10%)
    // ----------------------------------------------------------
    let pbvScore: number | null = null;
    let pbvLabel = "PBV — Tidak tersedia";
    if (fundamentals.pbvRatio !== null) {
      const pbv = fundamentals.pbvRatio;
      if (pbvRelative !== null) {
        if (pbvRelative <= 0.6) {
          pbvScore = 1.0;
          pbvLabel = `PBV ${pbv.toFixed(2)}x — ${(pbvRelative * 100).toFixed(0)}% dari median sektor, jauh lebih murah`;
        } else if (pbvRelative <= 0.85) {
          pbvScore = 0.75;
          pbvLabel = `PBV ${pbv.toFixed(2)}x — Lebih murah dari rata-rata sektor (median: ${sectorMedianPBV!.toFixed(2)}x)`;
        } else if (pbvRelative <= 1.15) {
          pbvScore = 0.5;
          pbvLabel = `PBV ${pbv.toFixed(2)}x — Setara rata-rata sektor`;
        } else if (pbvRelative <= 1.5) {
          pbvScore = 0.25;
          pbvLabel = `PBV ${pbv.toFixed(2)}x — Lebih mahal dari rata-rata sektor`;
        } else {
          pbvScore = 0.0;
          pbvLabel = `PBV ${pbv.toFixed(2)}x — Jauh lebih mahal dari sektor`;
        }
      } else if (pbv > 0) {
        if (isBank || isConglomerate) {
          if (pbv <= 1.0) {
            pbvScore = 1.0;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Di bawah nilai buku`;
          } else if (pbv <= 2.0) {
            pbvScore = 0.75;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Murah untuk sektor ini`;
          } else if (pbv <= 3.5) {
            pbvScore = 0.5;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Wajar untuk sektor ini`;
          } else if (pbv <= 5.0) {
            pbvScore = 0.25;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Sedikit mahal`;
          } else {
            pbvScore = 0.1;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Mahal`;
          }
        } else {
          if (pbv <= 1.0) {
            pbvScore = 1.0;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Di bawah nilai buku`;
          } else if (pbv <= 2.0) {
            pbvScore = 0.8;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Murah (1–2x)`;
          } else if (pbv <= 3.0) {
            pbvScore = 0.5;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Wajar (2–3x)`;
          } else if (pbv <= 5.0) {
            pbvScore = 0.2;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Mahal (3–5x)`;
          } else {
            pbvScore = 0.0;
            pbvLabel = `PBV ${pbv.toFixed(2)}x — Sangat mahal (>5x)`;
          }
        }
      } else {
        pbvScore = 0;
        pbvLabel = `PBV negatif — Ekuitas negatif`;
      }
      metrics.push({ score: pbvScore, weight: 10 });
    }

    // Combined relative valuation summary label
    let relValScore: number | null = null;
    let relValLabel = "Valuasi Relatif — Data sektor tidak tersedia";
    const relInput = peRelative ?? pbvRelative;
    if (relInput !== null) {
      if (relInput <= 0.7) {
        relValScore = 1.0;
        relValLabel = `${(relInput * 100).toFixed(0)}% dari median sektor — Jauh lebih murah dari peers`;
      } else if (relInput <= 0.85) {
        relValScore = 0.75;
        relValLabel = `${(relInput * 100).toFixed(0)}% dari median sektor — Lebih murah dari peers`;
      } else if (relInput <= 1.0) {
        relValScore = 0.5;
        relValLabel = `${(relInput * 100).toFixed(0)}% dari median sektor — Setara dengan peers`;
      } else if (relInput <= 1.3) {
        relValScore = 0.25;
        relValLabel = `${(relInput * 100).toFixed(0)}% dari median sektor — Lebih mahal dari peers`;
      } else {
        relValScore = 0.0;
        relValLabel = `${(relInput * 100).toFixed(0)}% dari median sektor — Jauh lebih mahal dari peers`;
      }
    }

    // ----------------------------------------------------------
    // 5. Debt-to-Equity (weight 15%) — skip for banks
    // ----------------------------------------------------------
    let deScore: number | null = null;
    let deLabel = "D/E Ratio — Tidak tersedia";
    if (fundamentals.debtToEquity !== null) {
      const de = fundamentals.debtToEquity;
      if (isBank) {
        deLabel = `D/E ${de.toFixed(2)}x — Normal untuk perbankan (tidak diskor)`;
      } else {
        if (de <= 0.3) {
          deScore = 1.0;
          deLabel = `D/E ${de.toFixed(2)}x — Sangat sehat, hampir bebas utang`;
        } else if (de <= 0.7) {
          deScore = 0.8;
          deLabel = `D/E ${de.toFixed(2)}x — Utang terkendali`;
        } else if (de <= 1.5) {
          deScore = 0.5;
          deLabel = `D/E ${de.toFixed(2)}x — Utang cukup tinggi`;
        } else if (de <= 3.0) {
          deScore = 0.2;
          deLabel = `D/E ${de.toFixed(2)}x — Utang tinggi, perlu diawasi`;
        } else {
          deScore = 0.0;
          deLabel = `D/E ${de.toFixed(2)}x — Utang sangat tinggi, risiko tinggi`;
        }
        metrics.push({ score: deScore, weight: 10 }); // reduced 15→10%
      }
    }

    // ----------------------------------------------------------
    // 6. Analyst Consensus (weight 10%)
    // ----------------------------------------------------------
    const totalAnalysts =
      fundamentals.analystBuy +
      fundamentals.analystHold +
      fundamentals.analystSell;
    let analystScore: number | null = null;
    let analystLabel = "Konsensus Analis — Tidak tersedia";
    if (totalAnalysts > 0) {
      const buyRatio = fundamentals.analystBuy / totalAnalysts;
      if (buyRatio >= 0.7) {
        analystScore = 1.0;
        analystLabel = `${fundamentals.analystBuy}B / ${fundamentals.analystHold}T / ${fundamentals.analystSell}J — Konsensus kuat BELI`;
      } else if (buyRatio >= 0.5) {
        analystScore = 0.75;
        analystLabel = `${fundamentals.analystBuy}B / ${fundamentals.analystHold}T / ${fundamentals.analystSell}J — Mayoritas rekomendasikan Beli`;
      } else if (buyRatio >= 0.3) {
        analystScore = 0.5;
        analystLabel = `${fundamentals.analystBuy}B / ${fundamentals.analystHold}T / ${fundamentals.analystSell}J — Pandangan campuran`;
      } else {
        analystScore = 0.2;
        analystLabel = `${fundamentals.analystBuy}B / ${fundamentals.analystHold}T / ${fundamentals.analystSell}J — Mayoritas Tahan/Jual`;
      }
      metrics.push({ score: analystScore, weight: 10 });
    }

    // ----------------------------------------------------------
    // Fair Value — blended multi-method
    // ----------------------------------------------------------
    const eps = fundamentals.trailingEps;
    const bvps = fundamentals.bookValuePerShare;
    const price = currentPrice;

    // Individual valuation estimates
    const peerFairValuePE: number | null =
      !isConglomerate && eps != null && eps > 0 && sectorMedianPE != null
        ? eps * sectorMedianPE
        : null;

    const peerFairValuePBV: number | null =
      bvps != null && bvps > 0 && sectorMedianPBV != null
        ? bvps * sectorMedianPBV
        : null;

    // Graham Number: only for non-conglomerates with both EPS & BVPS positive
    const grahamNumber: number | null =
      !isConglomerate && eps != null && eps > 0 && bvps != null && bvps > 0
        ? Math.sqrt(22.5 * eps * bvps)
        : null;

    const histFairValue = historicalMeanPrice;

    // Blended fair value — weighting depends on stock type
    let fairValue: number | null = null;
    let fairValueMethod = "Tidak tersedia";
    let fairValueIsValuationBased = false; // controls MoS scoring

    if (isConglomerate) {
      // Conglomerates: PBV-based only (PE less meaningful)
      if (peerFairValuePBV != null) {
        fairValue = peerFairValuePBV;
        fairValueMethod = "BVPS × Median PBV Sektor (Konglomerat)";
        fairValueIsValuationBased = true;
      } else if (histFairValue != null) {
        fairValue = histFairValue;
        fairValueMethod = "Rata-rata Harga 120 Hari";
      }
    } else if (isBank) {
      // Banks: blend PE (50%) + PBV (50%); if only one available use that alone
      const bankComponents: { value: number; w: number; label: string }[] = [];
      if (peerFairValuePE != null)
        bankComponents.push({
          value: peerFairValuePE,
          w: 0.5,
          label: "EPS×Median PE",
        });
      if (peerFairValuePBV != null)
        bankComponents.push({
          value: peerFairValuePBV,
          w: 0.5,
          label: "BVPS×Median PBV",
        });
      if (bankComponents.length > 0) {
        const totalW = bankComponents.reduce((s, c) => s + c.w, 0);
        fairValue =
          bankComponents.reduce((s, c) => s + c.value * c.w, 0) / totalW;
        fairValueMethod =
          bankComponents.length === 2
            ? "Blend: EPS×Median PE (50%) + BVPS×Median PBV (50%) [Perbankan]"
            : `${bankComponents[0].label} [Perbankan]`;
        fairValueIsValuationBased = true;
      } else if (histFairValue != null) {
        fairValue = histFairValue;
        fairValueMethod = "Rata-rata Harga 120 Hari";
      }
    } else {
      // Regular stocks: blend PE (40%) + PBV (40%) + Graham (20%)
      const regComponents: { value: number; w: number; label: string }[] = [];
      if (peerFairValuePE != null)
        regComponents.push({
          value: peerFairValuePE,
          w: 40,
          label: `EPS×Median PE`,
        });
      if (peerFairValuePBV != null)
        regComponents.push({
          value: peerFairValuePBV,
          w: 40,
          label: `BVPS×Median PBV`,
        });
      if (grahamNumber != null)
        regComponents.push({
          value: grahamNumber,
          w: 20,
          label: `Graham Number`,
        });
      if (regComponents.length > 0) {
        const totalW = regComponents.reduce((s, c) => s + c.w, 0);
        fairValue =
          regComponents.reduce((s, c) => s + c.value * c.w, 0) / totalW;
        if (regComponents.length === 1) {
          fairValueMethod = regComponents[0].label;
        } else {
          const parts = regComponents.map((c) => `${c.label}`);
          fairValueMethod = `Blend: ${parts.join(" + ")}`;
        }
        fairValueIsValuationBased = true;
      } else if (histFairValue != null) {
        fairValue = histFairValue;
        fairValueMethod = "Rata-rata Harga 120 Hari";
      }
    }

    // Legacy compat: peerFairValue = primary PE-based (or PBV for conglomerates)
    const peerFairValue = peerFairValuePE ?? peerFairValuePBV;

    let marginOfSafety: number | null = null;
    if (fairValue != null && price != null && price > 0) {
      marginOfSafety = (fairValue - price) / fairValue;
    }

    // ----------------------------------------------------------
    // 7. Margin of Safety (weight 25%) — only when valuation-based fair value available
    // ----------------------------------------------------------
    let mosScore: number | null = null;
    let mosLabel = "Margin of Safety — Harga wajar tidak tersedia dari valuasi";
    if (fairValueIsValuationBased && marginOfSafety !== null) {
      const mos = marginOfSafety;
      const mosPct = (mos * 100).toFixed(1);
      if (mos >= 0.3) {
        mosScore = 1.0;
        mosLabel = `MoS +${mosPct}% — Sangat undervalued, diskon besar dari harga wajar`;
      } else if (mos >= 0.15) {
        mosScore = 0.75;
        mosLabel = `MoS +${mosPct}% — Undervalued, harga di bawah wajar`;
      } else if (mos >= 0.0) {
        mosScore = 0.5;
        mosLabel = `MoS +${mosPct}% — Mendekati harga wajar`;
      } else if (mos >= -0.15) {
        mosScore = 0.25;
        mosLabel = `MoS ${mosPct}% — Sedikit di atas harga wajar (premium ringan)`;
      } else {
        mosScore = 0.0;
        mosLabel = `MoS ${mosPct}% — Overvalued, harga jauh di atas wajar`;
      }
      metrics.push({ score: mosScore, weight: 25 });
    }

    // ----------------------------------------------------------
    // Normalize and compute final score
    // ----------------------------------------------------------
    const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
    const avgScore =
      totalWeight === 0
        ? 0.5
        : metrics.reduce((sum, m) => sum + m.score * m.weight, 0) / totalWeight;

    return {
      score: new Score(Math.min(1, Math.max(0, avgScore))),
      breakdown: {
        pe: fundamentals.peRatio,
        peScore,
        peLabel,
        pbv: fundamentals.pbvRatio,
        pbvScore,
        pbvLabel,
        roe: fundamentals.roe,
        roeScore,
        roeLabel,
        revenueGrowth: fundamentals.revenueGrowth,
        revenueGrowthScore,
        revenueGrowthLabel,
        debtToEquity: fundamentals.debtToEquity,
        deScore,
        deLabel,
        earningsGrowth: fundamentals.earningsGrowth,
        profitMargin: fundamentals.profitMargin,
        isConglomerate,
        isBank,
        sector: fundamentals.sector,
        industry: fundamentals.industry,
        currentPrice: price,
        trailingEps: eps,
        bookValuePerShare: bvps,
        sectorMedianPE,
        sectorMedianPBV,
        peRelative,
        pbvRelative,
        relValScore,
        relValLabel,
        price52wHigh,
        price52wLow,
        pricePosition52w,
        historicalMeanPrice,
        priceHistScore,
        priceHistLabel,
        fairValue,
        fairValueMethod,
        marginOfSafety,
        grahamNumber,
        peerFairValue,
        peerFairValuePE,
        peerFairValuePBV,
        histFairValue,
        mosScore,
        mosLabel,
        analystBuy: fundamentals.analystBuy,
        analystHold: fundamentals.analystHold,
        analystSell: fundamentals.analystSell,
        analystScore,
        analystLabel,
      },
    };
  }
}
