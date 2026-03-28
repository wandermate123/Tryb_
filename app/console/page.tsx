import Link from "next/link";
import { ManualRunPanel } from "@/app/components/ManualRunPanel";
import { getEnvConfigurationStatus, isOutboundReady } from "@/lib/env-status";

export const dynamic = "force-dynamic";

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li>
      <span className={`check-icon ${ok ? "ok" : "miss"}`}>{ok ? "✓" : "!"}</span>
      <div>
        <strong style={{ color: "var(--text)" }}>{label}</strong>
        <div style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{detail}</div>
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
          <p className="lead" style={{ marginBottom: "0.5rem" }}>
            Step-by-step setup: see <code>SETUP.md</code> in the project root.
          </p>
        </div>
      </section>

      <section className="section" id="guide" style={{ paddingTop: 0 }}>
        <div className="container">
          <h2 className="section-title">How the pipeline works</h2>
          <p className="lead">Run these steps once; then automation handles the rest.</p>

          <div className="step-grid" style={{ marginBottom: "3rem" }}>
            {[
              {
                n: "01",
                t: "Apollo search",
                d: "POST to mixed_people/search with titles (Founder, Managing Director), geo, and company size 11–200. Fetches up to 20 contacts per run.",
              },
              {
                n: "02",
                t: "Rate-limited loop",
                d: "Each contact waits 10 seconds before processing to reduce 429s from Apollo, Gemini, and Resend.",
              },
              {
                n: "03",
                t: "Email unlock",
                d: "POST people/match with the Apollo person id. No email returned? That row is skipped.",
              },
              {
                n: "04",
                t: "Gemini pitch",
                d: "gemini-2.5-flash writes a 3-sentence, jargon-free body using name, company, and industry.",
              },
              {
                n: "05",
                t: "Resend",
                d: "Plain-text email with subject: “Quick question about [Company]'s digital presence”.",
              },
              {
                n: "06",
                t: "Database",
                d: "Successful sends create an OutboundLead row (pitch text, status Sent, timestamp).",
              },
            ].map((s) => (
              <div key={s.n} className="step-card">
                <div className="step-num">{s.n}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>

          <h2 className="section-title" style={{ fontSize: "1.65rem" }}>
            One-time setup checklist
          </h2>
          <p className="lead" style={{ marginBottom: "1.5rem" }}>
            Copy <code>.env.example</code> to <code>.env</code> locally; in Vercel, add the same keys under
            Project → Settings → Environment Variables.
          </p>

          <div className="card" style={{ marginBottom: "2rem" }}>
            <ul className="checklist">
              <CheckRow
                ok={env.databaseUrl}
                label="Supabase / Postgres"
                detail="DATABASE_URL — create a project, copy the connection string (pooler URI for serverless)."
              />
              <CheckRow
                ok={env.apolloApiKey}
                label="Apollo.io"
                detail="APOLLO_API_KEY — REST key from API settings. Search + match consume credits."
              />
              <CheckRow
                ok={env.geminiApiKey}
                label="Google Gemini"
                detail="GEMINI_API_KEY — from Google AI Studio."
              />
              <CheckRow
                ok={env.resendApiKey && env.resendFrom}
                label="Resend"
                detail="RESEND_API_KEY and RESEND_FROM — verify your domain; use a real From for production."
              />
              <CheckRow
                ok={env.cronSecret}
                label="Cron secret (recommended)"
                detail="CRON_SECRET — Vercel sends Authorization: Bearer … on cron hits; required for secure production."
              />
            </ul>
          </div>

          <div className="card" style={{ marginBottom: "2rem" }}>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.1rem",
                margin: "0 0 1rem",
              }}
            >
              Sync the database schema
            </h3>
            <p style={{ margin: "0 0 1rem", color: "var(--text-muted)", fontSize: "0.95rem" }}>
              From the project root (with <code>.env</code> pointing at Supabase):
            </p>
            <pre className="pre-block">npx prisma db push</pre>
            <p style={{ margin: "1rem 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Or use <code>prisma migrate dev</code> if you prefer versioned migrations.
            </p>
          </div>

          <div className="card" style={{ marginBottom: "2rem" }}>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.1rem",
                margin: "0 0 1rem",
              }}
            >
              Schedule on Vercel
            </h3>
            <p style={{ margin: "0 0 1rem", color: "var(--text-muted)", fontSize: "0.95rem" }}>
              <code>vercel.json</code> includes a sample cron (daily at 09:00 UTC). Adjust the schedule in the
              Vercel dashboard if needed. Production plans support long execution times—this job can run several
              minutes per batch.
            </p>
            <pre className="pre-block">{`// vercel.json (excerpt)
"crons": [{ "path": "/api/cron/outbound", "schedule": "0 9 * * *" }]`}</pre>
          </div>

          <h2 className="section-title" style={{ fontSize: "1.65rem" }}>
            Environment reference
          </h2>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="env-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>DATABASE_URL</code>
                  </td>
                  <td className="muted">Supabase PostgreSQL connection string for Prisma.</td>
                </tr>
                <tr>
                  <td>
                    <code>APOLLO_API_KEY</code>
                  </td>
                  <td className="muted">Apollo REST API authentication.</td>
                </tr>
                <tr>
                  <td>
                    <code>GEMINI_API_KEY</code>
                  </td>
                  <td className="muted">Google Generative AI (Gemini 2.5 Flash).</td>
                </tr>
                <tr>
                  <td>
                    <code>RESEND_API_KEY</code>
                  </td>
                  <td className="muted">Send transactional email.</td>
                </tr>
                <tr>
                  <td>
                    <code>RESEND_FROM</code>
                  </td>
                  <td className="muted">Verified sender, e.g. Tryb Studios &lt;hello@yourdomain.com&gt;.</td>
                </tr>
                <tr>
                  <td>
                    <code>CRON_SECRET</code>
                  </td>
                  <td className="muted">Optional but strongly recommended; Bearer token for cron + manual calls.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: "2.5rem" }} id="run">
            <h2 className="section-title" style={{ fontSize: "1.65rem" }}>
              Test a run (detailed)
            </h2>
            <p className="lead" style={{ marginBottom: "1.25rem" }}>
              Status from this server session:{" "}
              <strong style={{ color: ready ? "var(--success)" : "var(--warning)" }}>
                {ready ? "Core env vars detected" : "Still missing required variables"}
              </strong>
              .
            </p>
            <ManualRunPanel requiresCronAuth={env.cronSecret} outboundReady={ready} />
          </div>
        </div>
      </section>
    </main>
  );
}
