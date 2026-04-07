import Link from "next/link";
import { ManualRunPanel } from "@/app/components/ManualRunPanel";
import { getEnvConfigurationStatus, isOutboundReady } from "@/lib/env-status";

export const dynamic = "force-dynamic";

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li>
      <span className={`check-icon ${ok ? "ok" : "miss"}`}>{ok ? "✓" : "!"}</span>
      <div>
        <strong style={{ color: "var(--text)" }}>{label}</strong>
      </div>
    </li>
  );
}

export default function ConsolePage() {
  const env = getEnvConfigurationStatus();
  const ready = isOutboundReady(env);

  return (
    <main>
      <section className="section" style={{ paddingTop: "2.5rem" }}>
        <div className="container">
          <p style={{ marginBottom: "1rem" }}>
            <Link href="/" style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              ← Dashboard
            </Link>
          </p>
          <p className="pill" style={{ marginBottom: "1.25rem" }}>
            Console
          </p>
          <h1
            className="section-title"
            style={{ fontSize: "clamp(2.25rem, 5vw, 3.25rem)", maxWidth: "16ch" }}
          >
            Env status &amp; job tools
          </h1>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <h2 className="section-title" style={{ fontSize: "1.65rem" }}>
            Status
          </h2>
          <div className="card" style={{ marginBottom: "2rem" }}>
            <ul className="checklist">
              <CheckRow ok={env.databaseUrl} label="DATABASE_URL" />
              <CheckRow ok={env.directUrl} label="DIRECT_URL" />
              <CheckRow ok={env.apolloApiKey} label="APOLLO_API_KEY" />
              <CheckRow ok={env.geminiApiKey} label="GEMINI_API_KEY" />
              <CheckRow ok={env.resendApiKey && env.resendFrom} label="RESEND_API_KEY / RESEND_FROM" />
              <CheckRow ok={env.cronSecret} label="CRON_SECRET" />
            </ul>
          </div>

          <div style={{ marginTop: "2.5rem" }}>
            <h2 className="section-title" style={{ fontSize: "1.65rem" }}>
              Run
            </h2>
            <ManualRunPanel requiresCronAuth={env.cronSecret} outboundReady={ready} />
          </div>
        </div>
      </section>
    </main>
  );
}
