"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RefreshButton({
  autoRefresh,
}: {
  autoRefresh: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(timer);
  }, [autoRefresh, router]);

  return (
    <button
      onClick={() => router.refresh()}
      style={{
        background: "var(--blue)",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      🔄 Refresh
      {autoRefresh && (
        <span style={{ marginLeft: 6, opacity: 0.8, fontSize: 11 }}>
          (auto 10d)
        </span>
      )}
    </button>
  );
}
