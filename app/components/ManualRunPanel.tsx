"use client";

import { useState } from "react";
import { useOutboundRun } from "@/hooks/useOutboundRun";

type Props = {
  requiresCronAuth: boolean;
  outboundReady: boolean;
};

export function ManualRunPanel({ requiresCronAuth, outboundReady }: Props) {
  const [bearer, setBearer] = useState("");
  const { loading, statusCode, raw, summary, run } = useOutboundRun(requiresCronAuth);

  return (
    <div className="card" id="run">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <span className="pill">Manual trigger</span>
        {!outboundReady && (
          <span style={{ fontSize: "0.85rem", color: "var(--warning)" }}>Not ready</span>
        )}
      </div>

      {requiresCronAuth && (
        <label
          style={{
            display: "block",
            marginBottom: "1rem",
            fontSize: "0.9rem",
            color: "var(--text-muted)",
          }}
        >
          <span style={{ display: "block", marginBottom: "0.4rem", color: "var(--text)" }}>
            Cron secret
          </span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder=""
            value={bearer}
            onChange={(e) => setBearer(e.target.value)}
          />
        </label>
      )}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading}
          onClick={() => run(bearer)}
        >
          {loading ? "Running…" : "Run outbound job now"}
        </button>
      </div>

      {statusCode !== null && (
        <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
          HTTP status:{" "}
          <strong style={{ color: statusCode >= 400 ? "var(--danger)" : "var(--success)" }}>
            {statusCode || "—"}
          </strong>
        </p>
      )}
      {summary && typeof summary.sent === "number" && (
        <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Sent: <strong style={{ color: "var(--text)" }}>{summary.sent}</strong> · Skipped:{" "}
          <strong style={{ color: "var(--text)" }}>{summary.skipped ?? "—"}</strong> · Search batch:{" "}
          <strong style={{ color: "var(--text)" }}>{summary.searchCount ?? "—"}</strong>
        </p>
      )}
      {raw && (
        <pre className="pre-block" style={{ marginTop: "1rem", maxHeight: "320px", overflow: "auto" }}>
          {(() => {
            try {
              return JSON.stringify(JSON.parse(raw), null, 2);
            } catch {
              return raw;
            }
          })()}
        </pre>
      )}
    </div>
  );
}
