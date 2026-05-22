import { FundamentalData } from "../entities/Stock";
import { Score } from "../value-objects/Score";

export interface FundamentalBreakdown {
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
}

export interface FundamentalResult {
  score: Score;
  breakdown: FundamentalBreakdown;
}

export class FundamentalScoringService {
  score(fundamentals: FundamentalData): Score {
    return this.scoreWithBreakdown(fundamentals).score;
  }

  scoreWithBreakdown(fundamentals: FundamentalData): FundamentalResult {
    const scores: number[] = [];

    // P/E Ratio: lower is better
    let peScore: number | null = null;
    let peLabel = "P/E — Tidak tersedia";
    if (fundamentals.peRatio !== null) {
      const pe = fundamentals.peRatio;
      if (pe > 0 && pe <= 10) {
        peScore = 1.0;
        peLabel = `P/E ${pe.toFixed(1)}x — Sangat murah (≤10x)`;
      } else if (pe > 10 && pe <= 15) {
        peScore = 0.8;
        peLabel = `P/E ${pe.toFixed(1)}x — Murah (10-15x)`;
      } else if (pe > 15 && pe <= 20) {
        peScore = 0.6;
        peLabel = `P/E ${pe.toFixed(1)}x — Wajar (15-20x)`;
      } else if (pe > 20 && pe <= 30) {
        peScore = 0.4;
        peLabel = `P/E ${pe.toFixed(1)}x — Sedikit mahal (20-30x)`;
      } else if (pe > 30) {
        peScore = 0.1;
        peLabel = `P/E ${pe.toFixed(1)}x — Mahal (>30x)`;
      } else {
        peScore = 0;
        peLabel = `P/E negatif — Perusahaan rugi`;
      }
      scores.push(peScore);
    }

    // PBV: lower is better
    let pbvScore: number | null = null;
    let pbvLabel = "PBV — Tidak tersedia";
    if (fundamentals.pbvRatio !== null) {
      const pbv = fundamentals.pbvRatio;
      if (pbv > 0 && pbv <= 1) {
        pbvScore = 1.0;
        pbvLabel = `PBV ${pbv.toFixed(2)}x — Di bawah nilai buku`;
      } else if (pbv > 1 && pbv <= 2) {
        pbvScore = 0.8;
        pbvLabel = `PBV ${pbv.toFixed(2)}x — Murah (1-2x)`;
      } else if (pbv > 2 && pbv <= 3) {
        pbvScore = 0.6;
        pbvLabel = `PBV ${pbv.toFixed(2)}x — Wajar (2-3x)`;
      } else if (pbv > 3 && pbv <= 5) {
        pbvScore = 0.3;
        pbvLabel = `PBV ${pbv.toFixed(2)}x — Mahal (3-5x)`;
      } else if (pbv > 5) {
        pbvScore = 0.1;
        pbvLabel = `PBV ${pbv.toFixed(2)}x — Sangat mahal (>5x)`;
      } else {
        pbvScore = 0;
        pbvLabel = `PBV negatif — Ekuitas negatif`;
      }
      scores.push(pbvScore);
    }

    // ROE: higher is better
    let roeScore: number | null = null;
    let roeLabel = "ROE — Tidak tersedia";
    if (fundamentals.roe !== null) {
      const roe = fundamentals.roe;
      if (roe >= 0.2) {
        roeScore = 1.0;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Sangat efisien (≥20%)`;
      } else if (roe >= 0.15) {
        roeScore = 0.8;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Efisien (15-20%)`;
      } else if (roe >= 0.1) {
        roeScore = 0.6;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Cukup baik (10-15%)`;
      } else if (roe >= 0.05) {
        roeScore = 0.3;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Rendah (5-10%)`;
      } else {
        roeScore = 0;
        roeLabel = `ROE ${(roe * 100).toFixed(1)}% — Sangat rendah/rugi`;
      }
      scores.push(roeScore);
    }

    // Revenue Growth YoY
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
        revenueGrowthScore = 0.3;
        revenueGrowthLabel = `Revenue Growth +${(rg * 100).toFixed(1)}% — Stagnan`;
      } else {
        revenueGrowthScore = 0;
        revenueGrowthLabel = `Revenue Growth ${(rg * 100).toFixed(1)}% — Penurunan pendapatan`;
      }
      scores.push(revenueGrowthScore);
    }

    // Debt-to-Equity: lower is better
    let deScore: number | null = null;
    let deLabel = "D/E Ratio — Tidak tersedia";
    if (fundamentals.debtToEquity !== null) {
      const de = fundamentals.debtToEquity;
      if (de <= 0.5) {
        deScore = 1.0;
        deLabel = `D/E ${de.toFixed(2)}x — Utang sangat rendah`;
      } else if (de <= 1.0) {
        deScore = 0.75;
        deLabel = `D/E ${de.toFixed(2)}x — Utang terkendali`;
      } else if (de <= 2.0) {
        deScore = 0.4;
        deLabel = `D/E ${de.toFixed(2)}x — Utang cukup tinggi`;
      } else {
        deScore = 0.1;
        deLabel = `D/E ${de.toFixed(2)}x — Utang sangat tinggi`;
      }
      scores.push(deScore);
    }

    const avgScore =
      scores.length === 0
        ? 0.5
        : scores.reduce((a, b) => a + b, 0) / scores.length;

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
      },
    };
  }
}
