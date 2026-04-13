"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useOutboundRun } from "@/hooks/useOutboundRun";

type Props = {
  requiresCronAuth: boolean;
  outboundReady: boolean;
  /** Env names still missing on the server (safe to show). */
  missingEnv: string[];
};

export function HeroOutboundCTA({ requiresCronAuth, outboundReady, missingEnv }: Props) {
  const router = useRouter();
  const [bearer, setBearer] = useState("");
  const { loading, statusCode, raw, summary, run } = useOutboundRun(requiresCronAuth);

  const success = statusCode !== null && statusCode < 400 && summary?.ok === true;
  const fail = statusCode !== null && (statusCode >= 400 || summary?.ok === false);

  useEffect(() => {
    if (!loading && success) {
      router.refresh();
    }
  }, [loading, success, router]);

  const needsCronToken = requiresCronAuth && bearer.trim().length === 0;
  const canStart = outboundReady && !needsCronToken;

  const blockReason =
    missingEnv.length > 0
      ? `Missing: ${missingEnv.join(", ")}`
      : needsCronToken
        ? "Token required"
        : null;

  return (
    <div className="hero-cta">
      {blockReason && (
        <p className="hero-cta__blocked" role="status">
          {blockReason}
        </p>
      )}

      {requiresCronAuth && (
        <label className="hero-cta__label hero-cta__label--visible">
          <span>Cron secret</span>
          <input
            className="input hero-cta__input"
            type="password"
            autoComplete="off"
            placeholder=""
            value={bearer}
            onChange={(e) => setBearer(e.target.value)}
          />
        </label>
      )}

      <button
        type="button"
        className="hero-cta__btn"
        disabled={loading || !canStart}
        onClick={() => run(bearer)}
      >
        {loading ? (
          <>
            <span className="hero-cta__spinner" aria-hidden />
            …
          </>
        ) : (
          <>Start outbound run</>
        )}
      </button>

      {statusCode !== null && (
        <div
          className={`hero-cta__outcome ${success ? "hero-cta__outcome--success" : ""} ${fail ? "hero-cta__outcome--fail" : ""}`}
        >
          {success && summary && (
            <>
              <strong>Done</strong>
              <p>
                <span className="hero-cta__stat">{summary.stored ?? 0} saved</span>
                {" · "}
                <span className="hero-cta__stat">{summary.sent ?? 0} sent</span>
                {" · "}
                <span className="hero-cta__stat">{summary.skipped ?? 0} skipped</span>
                {" · "}
                <span className="hero-cta__stat">{summary.searchCount ?? 0} found</span>
              </p>
              <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                <a href="/leads-sheet" className="hero-cta__outcome-link">
                  Sheet →
                </a>
                <a href="/leads" className="hero-cta__outcome-link">
                  Cards →
                </a>
              </div>
              {summary.emailSendSkipped && (
                <p className="hero-cta__blocked" style={{ marginTop: "0.75rem" }}>
                  This deployment did not send email (skip mode is enabled in environment).
                </p>
              )}
              {summary.errors && summary.errors.length > 0 && (
                <details className="hero-cta__details" style={{ marginTop: "0.75rem" }}>
                  <summary>Run messages ({summary.errors.length})</summary>
                  <ul
                    style={{
                      margin: "0.5rem 0 0",
                      paddingLeft: "1.25rem",
                      fontSize: "0.88rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {summary.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>{e.message}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {fail && (
            <>
              <strong>Failed</strong>
              <p>{summary?.error ?? (statusCode === 401 ? "Unauthorized" : `HTTP ${statusCode}`)}</p>
            </>
          )}
        </div>
      )}

      {raw && fail && (
        <details className="hero-cta__details">
          <summary>Response</summary>
          <pre className="pre-block hero-cta__pre">
            {(() => {
              try {
                return JSON.stringify(JSON.parse(raw), null, 2);
              } catch {
                return raw;
              }
            })()}
          </pre>
        </details>
      )}
    </div>
  );
}
