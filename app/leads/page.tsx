import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  let leads: Awaited<ReturnType<typeof prisma.outboundLead.findMany>> = [];
  let loadError: string | null = null;

  try {
    leads = await prisma.outboundLead.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load leads.";
  }

  return (
    <main className="section" style={{ paddingTop: "2rem" }}>
      <div className="container">
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/" style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
            ← Back to dashboard
          </Link>
          <h1 className="section-title" style={{ marginTop: "1rem" }}>
            Logged outbound leads
          </h1>
        </div>

        {loadError && (
          <div
            className="card"
            style={{
              borderColor: "rgba(212, 132, 124, 0.35)",
              background: "rgba(212, 132, 124, 0.08)",
            }}
          >
            <strong style={{ color: "var(--danger)" }}>Database error</strong>
            <p style={{ margin: "0.5rem 0 0", color: "var(--text-muted)", fontSize: "0.95rem" }}>{loadError}</p>
          </div>
        )}

        {!loadError && leads.length === 0 && (
          <div className="card muted" style={{ textAlign: "center", padding: "2.5rem" }}>
            No leads yet.
          </div>
        )}

        {!loadError && leads.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {leads.map((lead) => (
              <article key={lead.id} className="card">
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    marginBottom: "0.75rem",
                  }}
                >
                  <h2
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.15rem",
                      margin: 0,
                      fontWeight: 700,
                    }}
                  >
                    {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.firstName}
                  </h2>
                  <span className="pill">{lead.status}</span>
                </div>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.92rem" }}>
                  <strong style={{ color: "var(--text-muted)" }}>Company:</strong> {lead.companyName}
                </p>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.92rem" }}>
                  <strong style={{ color: "var(--text-muted)" }}>Industry:</strong> {lead.industry}
                </p>
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.92rem" }}>
                  <strong style={{ color: "var(--text-muted)" }}>Email:</strong>{" "}
                  {lead.directEmail ? (
                    <a style={{ color: "var(--accent)" }} href={`mailto:${lead.directEmail}`}>
                      {lead.directEmail}
                    </a>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>Not from Apollo yet</span>
                  )}
                </p>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Sent {lead.createdAt.toISOString()}
                </p>
                {lead.repliedAt && (
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--accent)" }}>
                    Replied {lead.repliedAt.toISOString()} ({lead.replyCount} total)
                  </p>
                )}
                {lead.lastReplySnippet && (
                  <p
                    style={{
                      margin: "0 0 0.5rem",
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    "{lead.lastReplySnippet}"
                  </p>
                )}
                <details style={{ marginTop: "0.75rem" }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      color: "var(--accent)",
                    }}
                  >
                    View pitch
                  </summary>
                  <pre
                    className="pre-block"
                    style={{ marginTop: "0.75rem", whiteSpace: "pre-wrap" }}
                  >
                    {lead.aiGeneratedPitch}
                  </pre>
                </details>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
