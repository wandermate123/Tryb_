"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useOutboundRun } from "@/hooks/useOutboundRun";

type Props = {
  requiresCronAuth: boolean;
  outboundReady: boolean;
};

export function HeroOutboundCTA({ requiresCronAuth, outboundReady }: Props) {
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

  const canStart =
    outboundReady && (!requiresCronAuth || bearer.trim().length > 0);

  return (
    <div className="hero-cta">
      {requiresCronAuth && (
        <label className="hero-cta__label">
          <span className="visually-hidden">Bearer token</span>
          <input
            className="input hero-cta__input"
            type="password"
            autoComplete="off"
            aria-label="Bearer token"
            value={bearer}
            onChange={(e) => setBearer(e.target.value)}
          />
        </label>
      )}

      <button type="button" className="hero-cta__btn" disabled={loading || !canStart} onClick={() => run(bearer)}>
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
                <span className="hero-cta__stat">{summary.sent ?? 0}</span> ·{" "}
                <span className="hero-cta__stat">{summary.skipped ?? 0}</span> ·{" "}
                <span className="hero-cta__stat">{summary.searchCount ?? 0}</span>
              </p>
              <a href="/leads" className="hero-cta__outcome-link">
                Leads →
              </a>
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
