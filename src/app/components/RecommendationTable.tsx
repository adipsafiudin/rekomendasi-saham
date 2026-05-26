"use client";

import { useState, useMemo, Fragment } from "react";

export interface RecommendationRow {
  id: string;
  ticker: string;
  date: string;
  entry_price: number;
  target_price: number;
  stop_loss: number;
  technical_score: number;
  fundamental_score: number;
  sentiment_score: number;
  aggregated_score: number;
  narrative: string;
  win_rate_at_recommendation: number;
  status: "PENDING" | "SUCCESS" | "FAILED";
  resolution_date: string | null;
  resolution_price: number | null;
  resolution_reason: string | null;
  technical_breakdown: TechnicalBreakdown | null;
  fundamental_breakdown: FundamentalBreakdown | null;
}

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
  // New indicators
  stochK: number | null;
  stochD: number | null;
  stochScore: number;
  stochLabel: string;
  obvSlope5: number;
  obvSlope20: number;
  accumulationScore: number;
  accumulationLabel: string;
  adx: number | null;
  consolidation: boolean;
  atrPct: number | null;
}

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
  // Additional quality metrics
  earningsGrowth: number | null;
  profitMargin: number | null;
  // Stock type
  isConglomerate: boolean;
  isBank: boolean;
  // Context
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
  // Historical price
  price52wHigh: number | null;
  price52wLow: number | null;
  pricePosition52w: number | null;
  historicalMeanPrice: number | null;
  priceHistScore: number | null;
  priceHistLabel: string;
  // Fair value
  fairValue: number | null;
  fairValueMethod: string;
  marginOfSafety: number | null;
  grahamNumber: number | null;
  peerFairValue: number | null;
  peerFairValuePE: number | null;
  peerFairValuePBV: number | null;
  histFairValue: number | null;
  mosScore: number | null;
  mosLabel: string;
  // Analyst consensus
  analystBuy: number;
  analystHold: number;
  analystSell: number;
  analystScore: number | null;
  analystLabel: string;
}

type Tab = "buy" | "history" | "backtest";
type SortKey = keyof RecommendationRow;
type FilterStatus = "ALL" | "PENDING" | "SUCCESS" | "FAILED";

function rp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function rr(entry: number, target: number, stop: number) {
  const reward = target - entry;
  const risk = entry - stop;
  if (risk <= 0) return "–";
  return `1 : ${(reward / risk).toFixed(1)}`;
}

function potReturn(entry: number, target: number) {
  return `+${(((target - entry) / entry) * 100).toFixed(1)}%`;
}

function ScoreBar({ value, label }: { value: number; label?: string }) {
  const color =
    value >= 0.75
      ? "var(--green)"
      : value >= 0.5
        ? "var(--blue)"
        : value >= 0.3
          ? "var(--yellow)"
          : "var(--red)";
  return (
    <div title={label}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            flex: 1,
            height: 6,
            background: "var(--bg3)",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${value * 100}%`,
              height: "100%",
              background: color,
              borderRadius: 3,
              transition: "width 0.3s",
            }}
          />
        </div>
        <span
          style={{
            fontSize: 12,
            color,
            width: 38,
            textAlign: "right",
            fontWeight: 600,
          }}
        >
          {pct(value)}
        </span>
      </div>
    </div>
  );
}

function ScoreDot({ value }: { value: number }) {
  const color =
    value >= 0.75
      ? "var(--green)"
      : value >= 0.5
        ? "var(--blue)"
        : value >= 0.3
          ? "var(--yellow)"
          : "var(--red)";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginRight: 4,
        verticalAlign: "middle",
      }}
    />
  );
}

type ScoreDim = "technical" | "fundamental" | "sentiment" | "aggregate";

function scoreLabel(
  dim: ScoreDim,
  value: number,
): { color: string; text: string } {
  if (dim === "technical") {
    if (value >= 0.8)
      return {
        color: "var(--green)",
        text: "Sinyal beli sangat kuat — momentum bullish dominan",
      };
    if (value >= 0.65)
      return {
        color: "var(--green)",
        text: "Sinyal teknikal positif — tren dan indikator mendukung",
      };
    if (value >= 0.5)
      return {
        color: "var(--blue)",
        text: "Teknikal moderat — beberapa indikator mendukung",
      };
    if (value >= 0.35)
      return {
        color: "var(--yellow)",
        text: "Sinyal mixed — perlu konfirmasi lebih lanjut",
      };
    return {
      color: "var(--red)",
      text: "Teknikal lemah — indikator cenderung bearish",
    };
  }
  if (dim === "fundamental") {
    if (value >= 0.8)
      return {
        color: "var(--green)",
        text: "Fundamental sangat kuat — valuasi menarik & pertumbuhan tinggi",
      };
    if (value >= 0.65)
      return {
        color: "var(--green)",
        text: "Fundamental solid — valuasi wajar, pertumbuhan baik",
      };
    if (value >= 0.5)
      return {
        color: "var(--blue)",
        text: "Fundamental moderat — valuasi dan pertumbuhan cukup",
      };
    if (value >= 0.35)
      return {
        color: "var(--yellow)",
        text: "Fundamental kurang — valuasi mahal atau pertumbuhan lambat",
      };
    return {
      color: "var(--red)",
      text: "Fundamental lemah — perhatikan risiko fundamental",
    };
  }
  if (dim === "sentiment") {
    if (value >= 0.8)
      return {
        color: "var(--green)",
        text: "Sentimen sangat positif — berita dan katalis mendukung kuat",
      };
    if (value >= 0.65)
      return {
        color: "var(--green)",
        text: "Sentimen positif — berita cenderung bullish",
      };
    if (value >= 0.5)
      return {
        color: "var(--blue)",
        text: "Sentimen netral-positif — berita beragam namun condong positif",
      };
    if (value >= 0.35)
      return {
        color: "var(--yellow)",
        text: "Sentimen mixed — berita beragam, waspadai risiko berita",
      };
    return {
      color: "var(--red)",
      text: "Sentimen negatif — berita kurang mendukung",
    };
  }
  // aggregate
  if (value >= 0.8)
    return {
      color: "var(--green)",
      text: "Konfluensi sangat kuat di semua aspek — setup ideal",
    };
  if (value >= 0.65)
    return {
      color: "var(--green)",
      text: "Setup menarik secara keseluruhan — layak dipertimbangkan",
    };
  if (value >= 0.5)
    return {
      color: "var(--blue)",
      text: "Setup moderat — risiko dan peluang relatif seimbang",
    };
  if (value >= 0.35)
    return {
      color: "var(--yellow)",
      text: "Setup kurang ideal — pertimbangkan manajemen risiko ketat",
    };
  return {
    color: "var(--red)",
    text: "Skor sangat rendah — tidak direkomendasikan untuk entry",
  };
}

function actualPnl(entry: number, exit: number | null): number | null {
  if (exit == null) return null;
  return ((exit - entry) / entry) * 100;
}

function ScoreSignal({ score }: { score: number | null }) {
  if (score === null)
    return (
      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>N/A</span>
    );
  const color =
    score >= 0.75
      ? "var(--green)"
      : score >= 0.5
        ? "var(--blue)"
        : score >= 0.3
          ? "var(--yellow)"
          : "var(--red)";
  const label =
    score >= 0.75
      ? "●●●●"
      : score >= 0.5
        ? "●●●○"
        : score >= 0.25
          ? "●●○○"
          : "●○○○";
  return (
    <span style={{ color, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
      {label}
    </span>
  );
}

function DetailedBreakdownPanel({
  tech,
  fund,
  sentimentScore,
  aggregatedScore,
  cardBg = "var(--bg3)",
}: {
  tech: TechnicalBreakdown | null;
  fund: FundamentalBreakdown | null;
  sentimentScore: number;
  aggregatedScore: number;
  cardBg?: string;
}) {
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 10,
        }}
      >
        {/* Technical indicators */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "var(--blue)",
              marginBottom: 8,
              letterSpacing: 1,
            }}
          >
            ANALISA TEKNIKAL
          </div>
          {tech ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(
                [
                  {
                    label: "RSI(14)",
                    score: tech.rsiScore,
                    desc: tech.rsiLabel,
                  },
                  {
                    label: "Stochastic(14,3)",
                    score: tech.stochScore,
                    desc: tech.stochLabel,
                  },
                  {
                    label: "MACD(12,26,9)",
                    score: tech.macdScore,
                    desc: tech.macdLabel,
                  },
                  {
                    label: "Bollinger Bands",
                    score: tech.bbScore,
                    desc: tech.bbLabel,
                  },
                  {
                    label: "EMA Trend + Volume",
                    score: tech.trendScore,
                    desc: tech.trendLabel,
                  },
                  {
                    label: "OBV Akumulasi",
                    score: tech.accumulationScore,
                    desc: tech.accumulationLabel,
                  },
                ] as { label: string; score: number; desc: string }[]
              ).map(({ label, score, desc }) => {
                const bc =
                  score >= 0.75
                    ? "var(--green)"
                    : score >= 0.5
                      ? "var(--blue)"
                      : score >= 0.25
                        ? "var(--yellow)"
                        : "var(--red)";
                return (
                  <div
                    key={label}
                    style={{
                      background: cardBg,
                      borderRadius: 5,
                      padding: "6px 10px",
                      borderLeft: `3px solid ${bc}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                        }}
                      >
                        {label}
                      </span>
                      <ScoreSignal score={score} />
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                );
              })}
              {/* ADX + Consolidation badges */}
              {(tech.adx != null || tech.consolidation) && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 2,
                  }}
                >
                  {tech.adx != null && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background:
                          tech.adx >= 25
                            ? "var(--green)"
                            : tech.adx < 15
                              ? "var(--red)"
                              : "var(--yellow)",
                        color: "#000",
                        fontWeight: 700,
                      }}
                    >
                      ADX {tech.adx.toFixed(0)}
                      {tech.adx >= 25
                        ? " 🔥 Tren Kuat"
                        : tech.adx < 15
                          ? " 😴 Sideways"
                          : " ➡ Tren Lemah"}
                    </span>
                  )}
                  {tech.consolidation && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: "var(--blue)",
                        color: "#000",
                        fontWeight: 700,
                      }}
                    >
                      🔒 Konsolidasi Ketat
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>
              Data tidak tersedia
            </p>
          )}
        </div>
        {/* Fundamental metrics */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "var(--yellow)",
              marginBottom: 8,
              letterSpacing: 1,
            }}
          >
            ANALISA FUNDAMENTAL
          </div>
          {fund ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Stock type + sector context */}
              {(fund.sector || fund.isConglomerate || fund.isBank) && (
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginBottom: 2,
                  }}
                >
                  {fund.sector}
                  {fund.industry ? ` · ${fund.industry}` : ""}
                  {fund.isConglomerate && (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "var(--blue)",
                        fontWeight: 700,
                      }}
                    >
                      KONGLOMERAT
                    </span>
                  )}
                  {fund.isBank && (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "var(--blue)",
                        fontWeight: 700,
                      }}
                    >
                      PERBANKAN
                    </span>
                  )}
                </div>
              )}
              {/* Fair value banner */}
              {fund.fairValue != null && (
                <div
                  style={{
                    background: "rgba(255,200,0,0.08)",
                    border: "1px solid var(--yellow)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    marginBottom: 2,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "var(--yellow)",
                      marginBottom: 4,
                    }}
                  >
                    💰 HARGA WAJAR — {fund.fairValueMethod}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    Rp {Math.round(fund.fairValue).toLocaleString("id-ID")}
                    {fund.marginOfSafety != null && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color:
                            fund.marginOfSafety >= 0.15
                              ? "var(--green)"
                              : fund.marginOfSafety >= 0
                                ? "var(--blue)"
                                : "var(--red)",
                          fontWeight: 700,
                        }}
                      >
                        {fund.marginOfSafety > 0 ? "▼" : "▲"}{" "}
                        {Math.abs(fund.marginOfSafety * 100).toFixed(1)}%{" "}
                        {fund.marginOfSafety >= 0.15
                          ? "diskon (undervalued)"
                          : fund.marginOfSafety >= 0
                            ? "mendekati wajar"
                            : "premium (overvalued)"}
                      </span>
                    )}
                  </div>
                  {/* Per-method components */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 5,
                      flexWrap: "wrap",
                    }}
                  >
                    {fund.peerFairValuePE != null && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        EPS×PE:{" "}
                        <strong>
                          Rp{" "}
                          {Math.round(fund.peerFairValuePE).toLocaleString(
                            "id-ID",
                          )}
                        </strong>
                      </div>
                    )}
                    {fund.peerFairValuePBV != null && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        BVPS×PBV:{" "}
                        <strong>
                          Rp{" "}
                          {Math.round(fund.peerFairValuePBV).toLocaleString(
                            "id-ID",
                          )}
                        </strong>
                      </div>
                    )}
                    {fund.grahamNumber != null && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        Graham:{" "}
                        <strong>
                          Rp{" "}
                          {Math.round(fund.grahamNumber).toLocaleString(
                            "id-ID",
                          )}
                        </strong>
                      </div>
                    )}
                    {fund.histFairValue != null && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        Rata-rata 120H:{" "}
                        <strong>
                          Rp{" "}
                          {Math.round(fund.histFairValue).toLocaleString(
                            "id-ID",
                          )}
                        </strong>
                      </div>
                    )}
                  </div>
                  {/* Extra quality metrics */}
                  {(fund.earningsGrowth != null ||
                    fund.profitMargin != null) && (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        marginTop: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      {fund.earningsGrowth != null && (
                        <div
                          style={{ fontSize: 10, color: "var(--text-muted)" }}
                        >
                          Earnings Growth:{" "}
                          <strong
                            style={{
                              color:
                                fund.earningsGrowth >= 0
                                  ? "var(--green)"
                                  : "var(--red)",
                            }}
                          >
                            {fund.earningsGrowth >= 0 ? "+" : ""}
                            {(fund.earningsGrowth * 100).toFixed(1)}%
                          </strong>
                        </div>
                      )}
                      {fund.profitMargin != null && (
                        <div
                          style={{ fontSize: 10, color: "var(--text-muted)" }}
                        >
                          Net Margin:{" "}
                          <strong
                            style={{
                              color:
                                fund.profitMargin >= 0.1
                                  ? "var(--green)"
                                  : fund.profitMargin >= 0
                                    ? "var(--blue)"
                                    : "var(--red)",
                            }}
                          >
                            {(fund.profitMargin * 100).toFixed(1)}%
                          </strong>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Sector context */}
                  {(fund.sectorMedianPE != null ||
                    fund.sectorMedianPBV != null) && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 3,
                      }}
                    >
                      {fund.sectorMedianPE != null &&
                        `Median PE sektor: ${fund.sectorMedianPE.toFixed(1)}x`}
                      {fund.sectorMedianPBV != null &&
                        (fund.sectorMedianPE != null ? " · " : "") +
                          `Median PBV: ${fund.sectorMedianPBV.toFixed(2)}x`}
                    </div>
                  )}
                </div>
              )}
              {(
                [
                  {
                    label: "Posisi Harga Historis",
                    score: fund.priceHistScore,
                    desc: fund.priceHistLabel,
                  },
                  ...(fund.mosScore != null
                    ? [
                        {
                          label: "Margin of Safety (Harga Wajar)",
                          score: fund.mosScore,
                          desc: fund.mosLabel,
                        },
                      ]
                    : fund.fairValue != null
                      ? [
                          {
                            label: "Margin of Safety",
                            score: null as number | null,
                            desc: fund.mosLabel,
                          },
                        ]
                      : []),
                  { label: "ROE", score: fund.roeScore, desc: fund.roeLabel },
                  {
                    label: "Revenue Growth",
                    score: fund.revenueGrowthScore,
                    desc: fund.revenueGrowthLabel,
                  },
                  {
                    label: "P/E Ratio",
                    score: fund.peScore,
                    desc: fund.peLabel,
                  },
                  {
                    label: "P/BV Ratio",
                    score: fund.pbvScore,
                    desc: fund.pbvLabel,
                  },
                  ...(fund.deScore != null
                    ? [
                        {
                          label: "Debt/Equity",
                          score: fund.deScore,
                          desc: fund.deLabel,
                        },
                      ]
                    : fund.isBank
                      ? [
                          {
                            label: "Debt/Equity",
                            score: null as number | null,
                            desc: fund.deLabel,
                          },
                        ]
                      : []),
                  ...(fund.relValScore != null
                    ? [
                        {
                          label: "Valuasi vs Sektor",
                          score: fund.relValScore,
                          desc: fund.relValLabel,
                        },
                      ]
                    : []),
                  ...(fund.analystScore != null
                    ? [
                        {
                          label: "Konsensus Analis",
                          score: fund.analystScore,
                          desc: fund.analystLabel,
                        },
                      ]
                    : []),
                ] as { label: string; score: number | null; desc: string }[]
              ).map(({ label, score, desc }) => {
                const bc =
                  score == null
                    ? "var(--border)"
                    : score >= 0.75
                      ? "var(--green)"
                      : score >= 0.5
                        ? "var(--blue)"
                        : score >= 0.25
                          ? "var(--yellow)"
                          : "var(--red)";
                return (
                  <div
                    key={label}
                    style={{
                      background: cardBg,
                      borderRadius: 5,
                      padding: "6px 10px",
                      borderLeft: `3px solid ${bc}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                        }}
                      >
                        {label}
                      </span>
                      <ScoreSignal score={score} />
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>
              Data tidak tersedia
            </p>
          )}
        </div>
      </div>
      {/* Sentiment + Aggregate summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          {
            dim: "sentiment" as ScoreDim,
            label: "Sentimen Berita",
            value: sentimentScore,
          },
          {
            dim: "aggregate" as ScoreDim,
            label: "Skor Agregat",
            value: aggregatedScore,
          },
        ].map(({ dim, label, value }) => {
          const { color, text } = scoreLabel(dim, value);
          return (
            <div
              key={dim}
              style={{
                background: cardBg,
                borderRadius: 5,
                padding: "6px 10px",
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                  }}
                >
                  {label.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color }}>
                  {pct(value)}
                </span>
              </div>
              <div
                style={{
                  height: 3,
                  background: "var(--bg2)",
                  borderRadius: 2,
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    width: `${value * 100}%`,
                    height: "100%",
                    background: color,
                    borderRadius: 2,
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  lineHeight: 1.4,
                }}
              >
                {text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Tab: Beli Sekarang ----
function BuyTab({ rows }: { rows: RecommendationRow[] }) {
  const pending = rows.filter((r) => r.status === "PENDING");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (pending.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">🔍</div>
        <p style={{ marginBottom: 6 }}>Tidak ada rekomendasi aktif saat ini.</p>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Pipeline berjalan setiap hari kerja pukul 18.00 WIB dan akan muncul di
          sini.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
        gap: 16,
      }}
    >
      {pending.map((r) => {
        const isOpen = expanded === r.id;
        const rrRatio = rr(r.entry_price, r.target_price, r.stop_loss);
        const pot = potReturn(r.entry_price, r.target_price);
        return (
          <div
            key={r.id}
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
              borderTop: "3px solid var(--green)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "14px 16px 10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      background: "var(--green)",
                      color: "#000",
                      fontWeight: 800,
                      fontSize: 15,
                      padding: "2px 10px",
                      borderRadius: 6,
                      letterSpacing: 1,
                    }}
                  >
                    {r.ticker}
                  </span>
                  <span
                    style={{
                      background: "#10b98120",
                      color: "var(--green)",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 4,
                      border: "1px solid var(--green)",
                    }}
                  >
                    ● AKTIF
                  </span>
                  <a
                    href={`https://www.tradingview.com/chart/?symbol=IDX:${r.ticker}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#2962ff18",
                      color: "#2962ff",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 4,
                      border: "1px solid #2962ff",
                      textDecoration: "none",
                    }}
                  >
                    📈 TradingView
                  </a>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {r.date}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginBottom: 2,
                  }}
                >
                  Skor Agregat
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color:
                      r.aggregated_score >= 0.75
                        ? "var(--green)"
                        : "var(--yellow)",
                  }}
                >
                  {pct(r.aggregated_score)}
                </div>
              </div>
            </div>

            {/* Price targets */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 0,
                borderTop: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderRight: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginBottom: 2,
                  }}
                >
                  ENTRY
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {rp(r.entry_price)}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginTop: 3,
                  }}
                >
                  📅 data {r.date}
                </div>
              </div>
              <div
                style={{
                  padding: "10px 14px",
                  borderRight: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--green)",
                    marginBottom: 2,
                  }}
                >
                  TARGET ↑
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--green)",
                  }}
                >
                  {rp(r.target_price)}
                </div>
                <div style={{ fontSize: 10, color: "var(--green)" }}>{pot}</div>
              </div>
              <div style={{ padding: "10px 14px" }}>
                <div
                  style={{ fontSize: 10, color: "var(--red)", marginBottom: 2 }}
                >
                  STOP LOSS ↓
                </div>
                <div
                  style={{ fontSize: 14, fontWeight: 700, color: "var(--red)" }}
                >
                  {rp(r.stop_loss)}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  R/R {rrRatio}
                </div>
              </div>
            </div>

            {/* Scores */}
            <div style={{ padding: "12px 16px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                {[
                  { label: "Teknikal", value: r.technical_score },
                  { label: "Fundamental", value: r.fundamental_score },
                  { label: "Sentimen", value: r.sentiment_score },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginBottom: 4,
                      }}
                    >
                      {label}
                    </div>
                    <ScoreBar value={value} />
                  </div>
                ))}
              </div>

              {/* Narrative preview */}
              <div
                onClick={() => setExpanded(isOpen ? null : r.id)}
                style={{
                  cursor: "pointer",
                  padding: "8px 0",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginBottom: 4,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>NARASI AI</span>
                  <span style={{ color: "var(--blue)" }}>
                    {isOpen ? "▲ Tutup" : "▼ Baca selengkapnya"}
                  </span>
                </div>
                {!isOpen ? (
                  <p
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--text-muted)",
                      margin: 0,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                    }}
                  >
                    {r.narrative || "—"}
                  </p>
                ) : (
                  <div>
                    <DetailedBreakdownPanel
                      tech={r.technical_breakdown}
                      fund={r.fundamental_breakdown}
                      sentimentScore={r.sentiment_score}
                      aggregatedScore={r.aggregated_score}
                      cardBg="var(--bg3)"
                    />
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        NARASI AI
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          lineHeight: 1.7,
                          margin: "0 0 8px",
                        }}
                      >
                        {r.narrative}
                      </p>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Win Rate historis:{" "}
                        <strong style={{ color: "var(--green)" }}>
                          {pct(r.win_rate_at_recommendation)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Tab: Riwayat ----
function HistoryTab({ rows }: { rows: RecommendationRow[] }) {
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "date",
    dir: -1,
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let data = [...rows];
    if (filter !== "ALL") data = data.filter((r) => r.status === filter);
    if (search)
      data = data.filter((r) => r.ticker.includes(search.toUpperCase()));
    data.sort((a, b) => {
      const av = a[sort.key],
        bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
    });
    return data;
  }, [rows, filter, search, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 },
    );
  }
  function sortIcon(key: SortKey) {
    return sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : " ↕";
  }

  const statusCounts = {
    ALL: rows.length,
    PENDING: rows.filter((r) => r.status === "PENDING").length,
    SUCCESS: rows.filter((r) => r.status === "SUCCESS").length,
    FAILED: rows.filter((r) => r.status === "FAILED").length,
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          Semua Rekomendasi ({filtered.length})
        </span>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            className="search-input"
            placeholder="Cari ticker..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="filter-bar">
            {(["ALL", "PENDING", "SUCCESS", "FAILED"] as FilterStatus[]).map(
              (s) => (
                <button
                  key={s}
                  className={`filter-btn ${filter === s ? "active" : ""}`}
                  onClick={() => setFilter(s)}
                >
                  {s} ({statusCounts[s]})
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div>
          <p>Tidak ada data.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th onClick={() => toggleSort("date")}>
                  Tanggal{sortIcon("date")}
                </th>
                <th onClick={() => toggleSort("ticker")}>
                  Ticker{sortIcon("ticker")}
                </th>
                <th>Entry / TP / SL</th>
                <th onClick={() => toggleSort("technical_score")}>
                  Teknikal{sortIcon("technical_score")}
                </th>
                <th onClick={() => toggleSort("fundamental_score")}>
                  Fundamental{sortIcon("fundamental_score")}
                </th>
                <th onClick={() => toggleSort("sentiment_score")}>
                  Sentimen{sortIcon("sentiment_score")}
                </th>
                <th onClick={() => toggleSort("aggregated_score")}>
                  Agregat{sortIcon("aggregated_score")}
                </th>
                <th onClick={() => toggleSort("status")}>
                  Status{sortIcon("status")}
                </th>
                <th>Hasil</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td
                      style={{
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.date}
                    </td>
                    <td>
                      <a
                        href={`https://www.tradingview.com/chart/?symbol=IDX:${r.ticker}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ textDecoration: "none" }}
                        title="Buka di TradingView"
                      >
                        <span className="ticker-pill">{r.ticker}</span>
                      </a>
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                      <span>{rp(r.entry_price)}</span>
                      <span style={{ color: "var(--green)", margin: "0 4px" }}>
                        → {rp(r.target_price)}
                      </span>
                      <span style={{ color: "var(--red)" }}>
                        / {rp(r.stop_loss)}
                      </span>
                    </td>
                    <td>
                      <ScoreDot value={r.technical_score} />
                      <span style={{ fontSize: 12 }}>
                        {pct(r.technical_score)}
                      </span>
                    </td>
                    <td>
                      <ScoreDot value={r.fundamental_score} />
                      <span style={{ fontSize: 12 }}>
                        {pct(r.fundamental_score)}
                      </span>
                    </td>
                    <td>
                      <ScoreDot value={r.sentiment_score} />
                      <span style={{ fontSize: 12 }}>
                        {pct(r.sentiment_score)}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      <ScoreDot value={r.aggregated_score} />
                      {pct(r.aggregated_score)}
                    </td>
                    <td>
                      <span className={`badge badge-${r.status.toLowerCase()}`}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {r.resolution_date ? (
                        <span>
                          {r.resolution_date}
                          <br />
                          {r.resolution_price ? rp(r.resolution_price) : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr key={`${r.id}-exp`}>
                      <td
                        colSpan={9}
                        style={{
                          background: "var(--bg3)",
                          padding: "16px 20px",
                        }}
                      >
                        {/* Detailed Score Breakdown */}
                        <div style={{ marginBottom: 14 }}>
                          <DetailedBreakdownPanel
                            tech={r.technical_breakdown}
                            fund={r.fundamental_breakdown}
                            sentimentScore={r.sentiment_score}
                            aggregatedScore={r.aggregated_score}
                            cardBg="var(--bg2)"
                          />
                        </div>

                        {/* Narrative + Resolution */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              r.status !== "PENDING" ? "1fr 1fr" : "1fr",
                            gap: 16,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--text-muted)",
                                marginBottom: 6,
                                fontWeight: 700,
                              }}
                            >
                              NARASI AI
                            </div>
                            <p
                              style={{
                                fontSize: 13,
                                lineHeight: 1.7,
                                margin: 0,
                              }}
                            >
                              {r.narrative || "—"}
                            </p>
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--text-muted)",
                                marginTop: 8,
                              }}
                            >
                              R/R:{" "}
                              <strong>
                                {rr(r.entry_price, r.target_price, r.stop_loss)}
                              </strong>
                              {"  ·  "}Potensi:{" "}
                              <strong style={{ color: "var(--green)" }}>
                                {potReturn(r.entry_price, r.target_price)}
                              </strong>
                              {"  ·  "}Win Rate:{" "}
                              <strong style={{ color: "var(--green)" }}>
                                {pct(r.win_rate_at_recommendation)}
                              </strong>
                            </div>
                          </div>

                          {r.status !== "PENDING" &&
                            (() => {
                              const pnl = actualPnl(
                                r.entry_price,
                                r.resolution_price,
                              );
                              const isSuccess = r.status === "SUCCESS";
                              return (
                                <div>
                                  <div
                                    style={{
                                      fontSize: 10,
                                      color: "var(--text-muted)",
                                      marginBottom: 6,
                                      fontWeight: 700,
                                    }}
                                  >
                                    HASIL AKHIR
                                  </div>
                                  <div
                                    style={{
                                      background: isSuccess
                                        ? "#10b98110"
                                        : "#ef444415",
                                      border: `1px solid ${isSuccess ? "var(--green)" : "var(--red)"}`,
                                      borderRadius: 6,
                                      padding: "10px 12px",
                                      marginBottom: 10,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: 8,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: 13,
                                          fontWeight: 700,
                                          color: isSuccess
                                            ? "var(--green)"
                                            : "var(--red)",
                                        }}
                                      >
                                        {isSuccess
                                          ? "✓ Target Profit Tercapai"
                                          : "✗ Stop Loss Tersentuh"}
                                      </span>
                                      {pnl != null && (
                                        <span
                                          style={{
                                            fontSize: 14,
                                            fontWeight: 800,
                                            color:
                                              pnl >= 0
                                                ? "var(--green)"
                                                : "var(--red)",
                                          }}
                                        >
                                          {pnl >= 0 ? "+" : ""}
                                          {pnl.toFixed(2)}%
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        lineHeight: 1.9,
                                        color: "var(--text-muted)",
                                      }}
                                    >
                                      <div>
                                        Harga masuk:{" "}
                                        <strong
                                          style={{ color: "var(--text)" }}
                                        >
                                          {rp(r.entry_price)}
                                        </strong>
                                      </div>
                                      {r.resolution_price != null && (
                                        <div>
                                          Harga keluar:{" "}
                                          <strong
                                            style={{ color: "var(--text)" }}
                                          >
                                            {rp(r.resolution_price)}
                                          </strong>
                                        </div>
                                      )}
                                      {r.resolution_date && (
                                        <div>
                                          Tanggal keluar:{" "}
                                          <strong
                                            style={{ color: "var(--text)" }}
                                          >
                                            {r.resolution_date}
                                          </strong>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {r.resolution_reason && (
                                    <div>
                                      <div
                                        style={{
                                          fontSize: 10,
                                          color: "var(--text-muted)",
                                          marginBottom: 4,
                                          fontWeight: 700,
                                        }}
                                      >
                                        ALASAN
                                      </div>
                                      <p
                                        style={{
                                          fontSize: 13,
                                          lineHeight: 1.6,
                                          margin: 0,
                                        }}
                                      >
                                        {r.resolution_reason}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Tab: Backtesting ----
function BacktestTab({ rows }: { rows: RecommendationRow[] }) {
  const completed = rows.filter((r) => r.status !== "PENDING");
  const success = rows.filter((r) => r.status === "SUCCESS");
  const failed = rows.filter((r) => r.status === "FAILED");
  const winRate = completed.length > 0 ? success.length / completed.length : 0;

  // Return calculation
  const avgSuccessReturn =
    success.length > 0
      ? success.reduce(
          (s, r) => s + (r.target_price - r.entry_price) / r.entry_price,
          0,
        ) / success.length
      : 0;
  const avgFailedReturn =
    failed.length > 0
      ? failed.reduce(
          (s, r) => s + (r.stop_loss - r.entry_price) / r.entry_price,
          0,
        ) / failed.length
      : 0;

  // Monthly grouping
  type MonthEntry = {
    month: string;
    total: number;
    success: number;
    failed: number;
    winRate: number;
  };
  const byMonth = rows.reduce<Record<string, MonthEntry>>((acc, r) => {
    if (r.status === "PENDING") return acc;
    const m = r.date.slice(0, 7);
    if (!acc[m])
      acc[m] = { month: m, total: 0, success: 0, failed: 0, winRate: 0 };
    acc[m].total++;
    if (r.status === "SUCCESS") acc[m].success++;
    if (r.status === "FAILED") acc[m].failed++;
    acc[m].winRate = acc[m].success / acc[m].total;
    return acc;
  }, {});
  const months = Object.values(byMonth).sort((a, b) =>
    b.month.localeCompare(a.month),
  );

  if (completed.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📊</div>
        <p>Belum ada rekomendasi yang selesai (SUCCESS/FAILED).</p>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
          Data backtesting akan muncul setelah harga mencapai target atau stop
          loss.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {[
          { label: "Total Selesai", value: completed.length, color: "" },
          {
            label: "Win Rate",
            value: `${(winRate * 100).toFixed(1)}%`,
            color: winRate >= 0.5 ? "var(--green)" : "var(--red)",
          },
          {
            label: "Sukses (TP Hit)",
            value: success.length,
            color: "var(--green)",
          },
          {
            label: "Gagal (SL Hit)",
            value: failed.length,
            color: "var(--red)",
          },
          {
            label: "Avg Return Menang",
            value: `+${(avgSuccessReturn * 100).toFixed(1)}%`,
            color: "var(--green)",
          },
          {
            label: "Avg Return Kalah",
            value: `${(avgFailedReturn * 100).toFixed(1)}%`,
            color: "var(--red)",
          },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="label">{s.label}</div>
            <div
              className="value"
              style={s.color ? { color: s.color } : undefined}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Win rate bar */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>
          Tingkat Keberhasilan
        </div>
        <div
          style={{
            display: "flex",
            height: 32,
            borderRadius: 6,
            overflow: "hidden",
            gap: 2,
          }}
        >
          <div
            style={{
              flex: success.length,
              background: "var(--green)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "#000",
            }}
          >
            {success.length > 0 && `${success.length} Sukses`}
          </div>
          <div
            style={{
              flex: failed.length,
              background: "var(--red)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {failed.length > 0 && `${failed.length} Gagal`}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 6,
          }}
        >
          <span style={{ color: "var(--green)" }}>
            ● Sukses: {(winRate * 100).toFixed(1)}%
          </span>
          <span style={{ color: "var(--red)" }}>
            ● Gagal: {((1 - winRate) * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Monthly breakdown */}
      {months.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Per Bulan</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bulan</th>
                  <th>Total</th>
                  <th>Sukses</th>
                  <th>Gagal</th>
                  <th>Win Rate</th>
                  <th>Visualisasi</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td style={{ fontWeight: 600 }}>{m.month}</td>
                    <td>{m.total}</td>
                    <td style={{ color: "var(--green)", fontWeight: 600 }}>
                      {m.success}
                    </td>
                    <td style={{ color: "var(--red)", fontWeight: 600 }}>
                      {m.failed}
                    </td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: m.winRate >= 0.5 ? "var(--green)" : "var(--red)",
                      }}
                    >
                      {(m.winRate * 100).toFixed(0)}%
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <div
                        style={{
                          display: "flex",
                          height: 14,
                          gap: 2,
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            flex: m.success,
                            background: "var(--green)",
                            opacity: 0.8,
                          }}
                        />
                        <div
                          style={{
                            flex: m.failed,
                            background: "var(--red)",
                            opacity: 0.8,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Best & Worst */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          {
            label: "🏆 Rekomendasi Terbaik",
            items: success
              .sort(
                (a, b) =>
                  (b.target_price - b.entry_price) / b.entry_price -
                  (a.target_price - a.entry_price) / a.entry_price,
              )
              .slice(0, 3),
          },
          {
            label: "📉 Rekomendasi Terburuk",
            items: failed
              .sort(
                (a, b) =>
                  (a.stop_loss - a.entry_price) / a.entry_price -
                  (b.stop_loss - b.entry_price) / b.entry_price,
              )
              .slice(0, 3),
          },
        ].map(({ label, items }) => (
          <div key={label} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              {label}
            </div>
            {items.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Belum ada data.
              </p>
            ) : (
              items.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <div>
                    <a
                      href={`https://www.tradingview.com/chart/?symbol=IDX:${r.ticker}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "none" }}
                      title="Buka di TradingView"
                    >
                      <span className="ticker-pill" style={{ marginRight: 8 }}>
                        {r.ticker}
                      </span>
                    </a>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                      {r.date}
                    </span>
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        r.status === "SUCCESS" ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {r.status === "SUCCESS"
                      ? potReturn(r.entry_price, r.target_price)
                      : `${(((r.stop_loss - r.entry_price) / r.entry_price) * 100).toFixed(1)}%`}
                  </span>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Main component ----
export default function RecommendationTable({
  rows,
}: {
  rows: RecommendationRow[];
}) {
  const [tab, setTab] = useState<Tab>("buy");
  const pending = rows.filter((r) => r.status === "PENDING").length;
  const success = rows.filter((r) => r.status === "SUCCESS").length;
  const failed = rows.filter((r) => r.status === "FAILED").length;

  const tabs: {
    id: Tab;
    label: string;
    badge?: number | string;
    badgeColor?: string;
  }[] = [
    {
      id: "buy",
      label: "🛒 Beli Sekarang",
      badge: pending,
      badgeColor: "var(--green)",
    },
    { id: "history", label: "📋 Riwayat", badge: rows.length },
    {
      id: "backtest",
      label: "📊 Backtesting",
      badge: `${success}W / ${failed}L`,
    },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          borderBottom: "2px solid var(--border)",
          paddingBottom: 0,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? "var(--text)" : "var(--text-muted)",
              borderBottom:
                tab === t.id
                  ? "2px solid var(--blue)"
                  : "2px solid transparent",
              marginBottom: -2,
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {t.label}
            {t.badge !== undefined && (
              <span
                style={{
                  background:
                    tab === t.id
                      ? (t.badgeColor ?? "var(--bg3)")
                      : "var(--bg3)",
                  color:
                    tab === t.id
                      ? t.badgeColor
                        ? "#000"
                        : "var(--text)"
                      : "var(--text-muted)",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 10,
                  border: `1px solid ${t.badgeColor ?? "var(--border)"}`,
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "buy" && <BuyTab rows={rows} />}
      {tab === "history" && <HistoryTab rows={rows} />}
      {tab === "backtest" && <BacktestTab rows={rows} />}
    </div>
  );
}
