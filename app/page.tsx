import Link from "next/link";
import { HeroOutboundCTA } from "@/app/components/HeroOutboundCTA";
import { getEnvConfigurationStatus, isOutboundReady } from "@/lib/env-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const env = getEnvConfigurationStatus();
  const ready = isOutboundReady(env);

  let recent: Awaited<ReturnType<typeof prisma.outboundLead.findMany>> = [];
  let total = 0;
  let lastAt: Date | null = null;

  try {
    const [rows, count] = await Promise.all([
      prisma.outboundLead.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.outboundLead.count(),
    ]);
    recent = rows;
    total = count;
    lastAt = rows[0]?.createdAt ?? null;
  } catch {
    /* DB unavailable */
  }

  return (
    <div className="landing">
      <div className="landing__glow" aria-hidden />

      <section className="landing__hero container">
        <div className="landing__hero-grid">
          <div>
            <p className="landing__eyebrow">Tryb Studios · Outbound</p>
            <h1 className="landing__title">Turn cold leads into conversations.</h1>
            <p className="landing__deck">Outbound, logged.</p>
            <HeroOutboundCTA requiresCronAuth={env.cronSecret} outboundReady={ready} />
          </div>

          <aside className="landing__side-card" aria-label="Snapshot">
            <p className="landing__side-label">Emails logged</p>
            <p className="landing__metric">{total}</p>
            <p className="landing__metric-sub">
              {lastAt
                ? `${lastAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })} · ${lastAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                : "—"}
            </p>
          </aside>
        </div>
      </section>

      <section className="section container" style={{ paddingTop: 0 }}>
        <div className="landing__results-head">
          <h2 className="landing__results-title">Latest results</h2>
          {total > 0 && (
            <Link href="/leads" className="landing__results-link">
              All {total} →
            </Link>
          )}
        </div>

        {recent.length === 0 && <div className="landing__empty">No results yet.</div>}

        {recent.length > 0 && (
          <div className="landing__grid">
            {recent.map((lead) => {
              const name =
                [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || lead.firstName;
              return (
                <article key={lead.id} className="landing__card">
                  <p className="landing__card-name">{name}</p>
                  <p className="landing__card-meta">
                    {lead.companyName} · {lead.industry}
                  </p>
                  <p className="landing__card-snippet">{lead.aiGeneratedPitch}</p>
                  <p className="landing__card-meta" style={{ marginTop: "0.65rem" }}>
                    {lead.createdAt.toLocaleString()}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
