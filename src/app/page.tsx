import { createClient } from "@supabase/supabase-js";
import RecommendationTable, {
  RecommendationRow,
} from "./components/RecommendationTable";

// Always render fresh from DB on every request (prevents Vercel static cache)
export const dynamic = "force-dynamic";

async function getRecommendations(): Promise<RecommendationRow[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("recommendation_history")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data as RecommendationRow[]) ?? [];
  // Deduplicate: keep newest row per (ticker, date) in case pipeline ran twice
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.ticker}__${r.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fmtWIB(isoOrDate: string | Date): string {
  return (
    new Date(isoOrDate).toLocaleString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }) + " WIB"
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

export default async function Home() {
  const rows = await getRecommendations();
  const pageLoadedAt = new Date();

  // Most recent pipeline run date (latest row date)
  const lastRunDate = rows.length > 0 ? rows[0].date : null;

  const pending = rows.filter((r) => r.status === "PENDING").length;
  const success = rows.filter((r) => r.status === "SUCCESS").length;
  const failed = rows.filter((r) => r.status === "FAILED").length;
  const resolved = success + failed;
  const winRate =
    resolved > 0 ? `${((success / resolved) * 100).toFixed(1)}%` : "–";
  const avgScore =
    rows.length > 0
      ? `${((rows.reduce((s, r) => s + r.aggregated_score, 0) / rows.length) * 100).toFixed(1)}%`
      : "–";

  return (
    <>
      <div className="page-header">
        <h1>Dashboard Rekomendasi Saham</h1>
        <p>
          Analisa otomatis IDX80 · Cron harian pukul 18.00 WIB (Senin–Jumat)
        </p>
      </div>

      {/* Data freshness info */}
      <div
        style={{
          background: "var(--bg2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 16px",
          marginBottom: 20,
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: 12,
        }}
      >
        <span>
          <span style={{ color: "var(--text-muted)" }}>
            🕐 Halaman dimuat:{" "}
          </span>
          <strong>{fmtWIB(pageLoadedAt)}</strong>
        </span>
        {lastRunDate && (
          <span>
            <span style={{ color: "var(--text-muted)" }}>
              📊 Rekomendasi terakhir:{" "}
            </span>
            <strong style={{ color: "var(--blue)" }}>{lastRunDate}</strong>
          </span>
        )}
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
          ⚠ Harga bukan realtime — diambil dari Yahoo Finance saat pipeline
          dijalankan. Cek tanggal data di tiap kartu.
        </span>
      </div>

      <div className="stats-grid">
        <StatCard label="Total Rekomendasi" value={rows.length} />
        <StatCard label="Pending" value={pending} color="var(--yellow)" />
        <StatCard label="Sukses (TP)" value={success} color="var(--green)" />
        <StatCard label="Gagal (SL)" value={failed} color="var(--red)" />
        <StatCard label="Win Rate" value={winRate} color="var(--green)" />
        <StatCard label="Avg Skor" value={avgScore} color="var(--blue)" />
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">🚀</div>
            <p style={{ marginBottom: 8 }}>Belum ada data rekomendasi.</p>
            <p>Jalankan pipeline pertama kali dengan:</p>
            <pre
              style={{
                marginTop: 8,
                background: "var(--bg3)",
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 12,
                display: "inline-block",
              }}
            >
              curl /api/cron/daily-job -H &quot;Authorization: Bearer
              YOUR_CRON_SECRET&quot;
            </pre>
          </div>
        </div>
      ) : (
        <RecommendationTable rows={rows} />
      )}
    </>
  );
}
