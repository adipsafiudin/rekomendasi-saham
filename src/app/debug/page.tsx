"use client";

import { useState, Fragment } from "react";

interface TechnicalBreakdown {
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

interface FundamentalBreakdown {
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
  histFairValue: number | null;
  // Analyst consensus
  analystBuy: number;
  analystHold: number;
  analystSell: number;
  analystScore: number | null;
  analystLabel: string;
}

interface ScoreResult {
  ticker: string;
  technicalScore: number;
  fundamentalScore: number;
  estimatedAggregate: number;
  wouldBuy: boolean;
  lastBarDate: string | null;
  currentPrice: number | null;
  technicalBreakdown: TechnicalBreakdown | null;
  fundamentalBreakdown: FundamentalBreakdown | null;
  error?: string;
}

interface DebugResponse {
  fetchedAt: string;
  latestDataDate: string | null;
  note: string;
  threshold: number;
  totalScored: number;
  candidatesAboveThreshold: number;
  errors: number;
  top: ScoreResult[];
}

function isToday(dateStr: string): boolean {
  const today = new Date().toLocaleDateString("sv", {
    timeZone: "Asia/Jakarta",
  });
  return dateStr === today;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function fmtTime(iso: string): string {
  return (
    new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Jakarta",
    }) + " WIB"
  );
}

function DataFreshnessBanner({
  fetchedAt,
  latestDataDate,
}: {
  fetchedAt: string;
  latestDataDate: string | null;
}) {
  const today = new Date().toLocaleDateString("sv", {
    timeZone: "Asia/Jakarta",
  });
  const isDataToday = latestDataDate === today;

  // Indonesian stock market open Mon-Fri 09:00–16:00 WIB
  const jakartaNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );
  const dayOfWeek = jakartaNow.getDay(); // 0=Sun, 6=Sat
  const hour = jakartaNow.getHours();
  const isMarketOpen =
    dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour < 16;
  const isMarketDay = dayOfWeek >= 1 && dayOfWeek <= 5;

  return (
    <div
      style={{
        background: isDataToday ? "#10b98115" : "#f59e0b15",
        border: `1px solid ${isDataToday ? "var(--green)" : "var(--yellow)"}`,
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 20,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontWeight: 700,
            marginBottom: 3,
          }}
        >
          📅 DATA HARGA TERAKHIR
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: isDataToday ? "var(--green)" : "var(--yellow)",
          }}
        >
          {isDataToday
            ? "✓ Hari ini"
            : latestDataDate
              ? `${latestDataDate} (kemarin/libur)`
              : "–"}
        </div>
        {latestDataDate && (
          <div
            style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}
          >
            {fmtDate(latestDataDate)}
          </div>
        )}
      </div>
      <div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontWeight: 700,
            marginBottom: 3,
          }}
        >
          🕐 DIAMBIL PADA
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {fmtTime(fetchedAt)}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {fmtDate(fetchedAt)}
        </div>
      </div>
      <div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontWeight: 700,
            marginBottom: 3,
          }}
        >
          🏦 STATUS PASAR (WIB)
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: isMarketOpen ? "var(--green)" : "var(--text-muted)",
          }}
        >
          {isMarketOpen
            ? "● Sedang buka"
            : isMarketDay
              ? "○ Tutup (di luar jam)"
              : "○ Akhir pekan / libur"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {isDataToday
            ? "Harga hari ini tersedia ✓"
            : "Bar terakhir = hari kerja sebelumnya"}
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  const color =
    value >= 0.75
      ? "var(--green)"
      : value >= 0.5
        ? "var(--blue)"
        : value >= 0.3
          ? "var(--yellow)"
          : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 80,
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
          }}
        />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600, width: 38 }}>
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  );
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

function BreakdownPanel({
  tech,
  fund,
  lastBarDate,
  currentPrice,
}: {
  tech: TechnicalBreakdown | null;
  fund: FundamentalBreakdown | null;
  lastBarDate: string | null;
  currentPrice: number | null;
}) {
  const dataIsToday = lastBarDate ? isToday(lastBarDate) : false;
  return (
    <div style={{ background: "var(--bg3)" }}>
      {/* Data source strip */}
      <div
        style={{
          padding: "8px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          gap: 24,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 11 }}>
          <span style={{ color: "var(--text-muted)" }}>Harga terakhir: </span>
          <strong>
            {currentPrice != null
              ? `Rp ${currentPrice.toLocaleString("id-ID")}`
              : "–"}
          </strong>
        </div>
        <div style={{ fontSize: 11 }}>
          <span style={{ color: "var(--text-muted)" }}>Data per tanggal: </span>
          <strong
            style={{ color: dataIsToday ? "var(--green)" : "var(--yellow)" }}
          >
            {lastBarDate ?? "–"}
            {dataIsToday
              ? " ✓ Hari ini"
              : " ⚠ Bukan hari ini (pasar tutup/libur)"}
          </strong>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          padding: "16px 20px",
        }}
      >
        {/* Technical */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "var(--blue)",
              marginBottom: 10,
              letterSpacing: 1,
            }}
          >
            ANALISA TEKNIKAL
          </div>
          {tech ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
              ).map(({ label, score, desc }) => (
                <div
                  key={label}
                  style={{
                    background: "var(--bg2)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    borderLeft: `3px solid ${score >= 0.75 ? "var(--green)" : score >= 0.5 ? "var(--blue)" : score >= 0.25 ? "var(--yellow)" : "var(--red)"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                      }}
                    >
                      {label}
                    </span>
                    <ScoreSignal score={score} />
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
              {(tech.adx != null || tech.consolidation) && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {tech.adx != null && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontWeight: 700,
                        background:
                          tech.adx >= 25
                            ? "var(--green)"
                            : tech.adx < 15
                              ? "var(--red)"
                              : "var(--yellow)",
                        color: "#000",
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
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontWeight: 700,
                        background: "var(--blue)",
                        color: "#000",
                      }}
                    >
                      🔒 Konsolidasi Ketat
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Data tidak tersedia
            </p>
          )}
        </div>

        {/* Fundamental */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "var(--yellow)",
              marginBottom: 10,
              letterSpacing: 1,
            }}
          >
            ANALISA FUNDAMENTAL
          </div>
          {fund ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Stock type + sector badge */}
              {(fund.sector || fund.isConglomerate || fund.isBank) && (
                <div
                  style={{
                    fontSize: 11,
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
                    padding: "8px 12px",
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
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    Rp {Math.round(fund.fairValue).toLocaleString("id-ID")}
                    {fund.marginOfSafety != null && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          color:
                            fund.marginOfSafety > 0
                              ? "var(--green)"
                              : "var(--red)",
                          fontWeight: 700,
                        }}
                      >
                        {fund.marginOfSafety > 0 ? "▼" : "▲"}{" "}
                        {Math.abs(fund.marginOfSafety * 100).toFixed(1)}%{" "}
                        {fund.marginOfSafety > 0 ? "diskon" : "premium"}
                      </span>
                    )}
                  </div>
                  {(fund.grahamNumber != null ||
                    fund.histFairValue != null) && (
                    <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                      {fund.grahamNumber != null && (
                        <div
                          style={{ fontSize: 11, color: "var(--text-muted)" }}
                        >
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
                        <div
                          style={{ fontSize: 11, color: "var(--text-muted)" }}
                        >
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
                  )}
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
              ).map(({ label, score, desc }) => (
                <div
                  key={label}
                  style={{
                    background: "var(--bg2)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    borderLeft: `3px solid ${score == null ? "var(--border)" : score >= 0.75 ? "var(--green)" : score >= 0.5 ? "var(--blue)" : score >= 0.25 ? "var(--yellow)" : "var(--red)"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                      }}
                    >
                      {label}
                    </span>
                    <ScoreSignal score={score} />
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Data tidak tersedia
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DebugPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DebugResponse | null>(null);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");
  const [topN, setTopN] = useState(30);
  const [singleTicker, setSingleTicker] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function runDebug() {
    if (!secret) {
      setError("Masukkan CRON_SECRET terlebih dahulu");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    setExpanded(null);
    try {
      const params = new URLSearchParams({ top: String(topN) });
      if (singleTicker) params.set("ticker", singleTicker.toUpperCase());
      const res = await fetch(`/api/debug/scores?${params}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const json = (await res.json()) as DebugResponse | { error: string };
      if (!res.ok) {
        setError((json as { error: string }).error);
        return;
      }
      setData(json as DebugResponse);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Debug Skor Teknikal &amp; Fundamental</h1>
        <p>
          Jalankan scoring tanpa Groq. Klik baris untuk melihat alasan tiap
          indikator.
        </p>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 20, padding: "16px" }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div>
            <label
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 4,
              }}
            >
              CRON SECRET
            </label>
            <input
              className="search-input"
              type="password"
              placeholder="Dari .env.local"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              style={{ width: 220 }}
              onKeyDown={(e) => e.key === "Enter" && runDebug()}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 4,
              }}
            >
              TICKER (opsional)
            </label>
            <input
              className="search-input"
              placeholder="Cth: BBCA"
              value={singleTicker}
              onChange={(e) => setSingleTicker(e.target.value)}
              style={{ width: 110 }}
              onKeyDown={(e) => e.key === "Enter" && runDebug()}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 4,
              }}
            >
              TOP N
            </label>
            <input
              className="search-input"
              type="number"
              min={1}
              max={80}
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              style={{ width: 70 }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={runDebug}
            disabled={loading}
          >
            {loading ? "⏳ Memproses..." : "▶ Jalankan Scoring"}
          </button>
        </div>
        {error && (
          <p style={{ marginTop: 10, color: "var(--red)", fontSize: 13 }}>
            ⚠ {error}
          </p>
        )}
      </div>

      {loading && (
        <div className="info-box" style={{ marginBottom: 20 }}>
          ⏳ Mengambil data Yahoo Finance untuk{" "}
          {singleTicker || "semua saham IDX80"} secara paralel... Estimasi
          waktu: {singleTicker ? "~5 detik" : "~30-60 detik"}
        </div>
      )}

      {data && (
        <>
          {/* Data freshness banner */}
          <DataFreshnessBanner
            fetchedAt={data.fetchedAt}
            latestDataDate={data.latestDataDate}
          />

          {/* Summary */}
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            {[
              { label: "Total Diskor", value: data.totalScored },
              {
                label: "Di atas Threshold",
                value: data.candidatesAboveThreshold,
                color:
                  data.candidatesAboveThreshold > 0
                    ? "var(--green)"
                    : "var(--red)",
              },
              {
                label: "Error",
                value: data.errors,
                color: data.errors > 0 ? "var(--yellow)" : undefined,
              },
              {
                label: "Threshold",
                value: `${(data.threshold * 100).toFixed(0)}%`,
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

          <div className="info-box" style={{ marginBottom: 16 }}>
            💡 {data.note}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">
                Top {data.top.length} Saham — Klik baris untuk melihat breakdown
                indikator
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Ticker</th>
                    <th>Harga Terakhir</th>
                    <th>Teknikal</th>
                    <th>Fundamental</th>
                    <th>Est. Agregat</th>
                    <th>Status</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.top.map((r, i) => {
                    const isOpen = expanded === r.ticker;
                    return (
                      <Fragment key={r.ticker}>
                        <tr
                          onClick={() => setExpanded(isOpen ? null : r.ticker)}
                          style={{
                            cursor: "pointer",
                            background: isOpen ? "var(--bg3)" : undefined,
                          }}
                        >
                          <td style={{ color: "var(--text-muted)" }}>
                            {i + 1}
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
                          <td style={{ whiteSpace: "nowrap" }}>
                            {r.currentPrice != null ? (
                              <>
                                <span style={{ fontWeight: 700 }}>
                                  Rp {r.currentPrice.toLocaleString("id-ID")}
                                </span>
                                {r.lastBarDate && (
                                  <div
                                    style={{
                                      fontSize: 10,
                                      color: isToday(r.lastBarDate)
                                        ? "var(--green)"
                                        : "var(--yellow)",
                                      marginTop: 2,
                                    }}
                                  >
                                    {isToday(r.lastBarDate)
                                      ? "● Hari ini"
                                      : `⚠ ${r.lastBarDate}`}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: 11,
                                }}
                              >
                                –
                              </span>
                            )}
                          </td>
                          <td>
                            <ScoreBar value={r.technicalScore} />
                          </td>
                          <td>
                            <ScoreBar value={r.fundamentalScore} />
                          </td>
                          <td>
                            <ScoreBar value={r.estimatedAggregate} />
                            {r.estimatedAggregate >= data.threshold && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "var(--green)",
                                  fontWeight: 700,
                                  marginLeft: 4,
                                }}
                              >
                                ▲ LOLOS
                              </span>
                            )}
                          </td>
                          <td>
                            {r.error ? (
                              <span
                                style={{ color: "var(--red)", fontSize: 11 }}
                              >
                                Error
                              </span>
                            ) : r.wouldBuy ? (
                              <span
                                style={{
                                  color: "var(--green)",
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                ✓ Kandidat beli
                              </span>
                            ) : (
                              <span
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: 11,
                                }}
                              >
                                Kurang +
                                {(
                                  (data.threshold - r.estimatedAggregate) *
                                  100
                                ).toFixed(1)}
                                %
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              textAlign: "center",
                              color: "var(--text-muted)",
                            }}
                          >
                            {isOpen ? "▲" : "▼"}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td
                              colSpan={7}
                              style={{ padding: 0, border: "none" }}
                            >
                              {r.error ? (
                                <div
                                  style={{
                                    padding: "12px 20px",
                                    color: "var(--red)",
                                    fontSize: 13,
                                  }}
                                >
                                  ⚠ Error: {r.error}
                                </div>
                              ) : (
                                <BreakdownPanel
                                  tech={r.technicalBreakdown}
                                  fund={r.fundamentalBreakdown}
                                  lastBarDate={r.lastBarDate}
                                  currentPrice={r.currentPrice}
                                />
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
