import { createClient } from "@supabase/supabase-js";
import RefreshButton from "./RefreshButton";

interface CronLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  triggered_by: string;
  recommended: string[] | null;
  audited: number | null;
  errors: string[] | null;
  message: string | null;
}

async function getLogs(): Promise<CronLog[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("cron_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);
  return (data as CronLog[]) ?? [];
}

function durationStr(started: string, completed: string | null): string {
  if (!completed) return "–";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtWIB(iso: string): string {
  return (
    new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Jakarta",
    }) + " WIB"
  );
}

function StatusBadge({ status }: { status: "RUNNING" | "SUCCESS" | "FAILED" }) {
  const config = {
    RUNNING: { color: "var(--yellow)", label: "⏳ BERJALAN" },
    SUCCESS: { color: "var(--green)", label: "✓ SUKSES" },
    FAILED: { color: "var(--red)", label: "✗ GAGAL" },
  }[status];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: config.color,
        padding: "2px 8px",
        border: `1px solid ${config.color}`,
        borderRadius: 4,
        whiteSpace: "nowrap",
      }}
    >
      {config.label}
    </span>
  );
}

export default async function LogsPage() {
  const logs = await getLogs();
  const hasRunning = logs.some((l) => l.status === "RUNNING");

  return (
    <>
      <div className="page-header">
        <h1>Log Cron Job</h1>
        <p>Riwayat eksekusi pipeline harian · Cron 18.00 WIB (Senin–Jumat)</p>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {hasRunning && (
            <span style={{ color: "var(--yellow)", fontWeight: 600 }}>
              ⏳ Ada job yang sedang berjalan — halaman otomatis refresh setiap
              10 detik.
            </span>
          )}
          {!hasRunning && logs.length > 0 && (
            <span>Menampilkan {logs.length} log terakhir.</span>
          )}
        </span>
        <RefreshButton autoRefresh={hasRunning} />
      </div>

      {logs.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <p style={{ color: "var(--text-muted)" }}>
            Belum ada log. Jalankan cron job terlebih dahulu.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Waktu Mulai (WIB)</th>
                  <th style={thStyle}>Selesai (WIB)</th>
                  <th style={thStyle}>Durasi</th>
                  <th style={thStyle}>Trigger</th>
                  <th style={thStyle}>Rekomendasi Baru</th>
                  <th style={thStyle}>Audit</th>
                  <th style={thStyle}>Error / Pesan</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    style={{
                      background:
                        log.status === "RUNNING"
                          ? "rgba(245,158,11,0.05)"
                          : undefined,
                    }}
                  >
                    <td style={tdStyle}>
                      <StatusBadge status={log.status} />
                    </td>
                    <td
                      style={{ ...tdStyle, whiteSpace: "nowrap", fontSize: 12 }}
                    >
                      {fmtWIB(log.started_at)}
                    </td>
                    <td
                      style={{ ...tdStyle, whiteSpace: "nowrap", fontSize: 12 }}
                    >
                      {log.completed_at ? (
                        fmtWIB(log.completed_at)
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>–</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>
                      {durationStr(log.started_at, log.completed_at)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontSize: 12,
                        color: "var(--text-muted)",
                      }}
                    >
                      {log.triggered_by}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>
                      {log.recommended && log.recommended.length > 0 ? (
                        <div>
                          <strong style={{ color: "var(--green)" }}>
                            {log.recommended.length} ticker
                          </strong>
                          <div
                            style={{
                              color: "var(--text-muted)",
                              fontSize: 11,
                              marginTop: 2,
                            }}
                          >
                            {log.recommended.join(", ")}
                          </div>
                        </div>
                      ) : log.status === "SUCCESS" ? (
                        <span style={{ color: "var(--text-muted)" }}>
                          Tidak ada
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>–</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>
                      {log.audited != null ? (
                        <span>{log.audited} pending diaudit</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>–</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {log.message ? (
                        <span
                          style={{
                            color: "var(--red)",
                            fontFamily: "var(--font-geist-mono)",
                          }}
                        >
                          {log.message.slice(0, 120)}
                          {log.message.length > 120 ? "…" : ""}
                        </span>
                      ) : log.errors && log.errors.length > 0 ? (
                        <details>
                          <summary
                            style={{
                              color: "var(--yellow)",
                              cursor: "pointer",
                            }}
                          >
                            {log.errors.length} ticker error
                          </summary>
                          <div
                            style={{
                              marginTop: 4,
                              color: "var(--text-muted)",
                              fontFamily: "var(--font-geist-mono)",
                              fontSize: 10,
                              maxHeight: 120,
                              overflowY: "auto",
                            }}
                          >
                            {log.errors.map((e, i) => (
                              <div key={i}>{e}</div>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "top",
};
