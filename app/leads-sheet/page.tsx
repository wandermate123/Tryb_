import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function Cell({ children, variant }: { children: React.ReactNode; variant?: "default" | "pitch" }) {
  const innerClass =
    variant === "pitch" ? "sheet__cell-inner sheet__cell-inner--pitch" : "sheet__cell-inner";
  return (
    <td className="sheet__cell">
      <div className={innerClass}>{children}</div>
    </td>
  );
}

function LinkOrDash({ href, label }: { href: string | null | undefined; label?: string }) {
  const h = href?.trim();
  if (!h) return <span className="sheet__muted">—</span>;
  const url = h.startsWith("http") ? h : `https://${h}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="sheet__link">
      {label ?? h}
    </a>
  );
}

export default async function LeadsSheetPage() {
  let leads: Awaited<ReturnType<typeof prisma.outboundLead.findMany>> = [];
  let loadError: string | null = null;

  try {
    leads = await prisma.outboundLead.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load leads.";
  }

  return (
    <main className="section sheet-page" style={{ paddingTop: "1.25rem" }}>
      <div className="sheet-page__bar container">
        <div>
          <Link href="/" className="sheet-page__back">
            ← Dashboard
          </Link>
          <h1 className="sheet-page__title">Leads · sheet</h1>
          <p className="sheet-page__sub">
            Spreadsheet view — {loadError ? "—" : `${leads.length} row${leads.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Link href="/leads" className="sheet-page__alt-link">
          Card view →
        </Link>
      </div>

      {loadError && (
        <div className="container">
          <div className="card sheet-page__error">
            <strong>Database error</strong>
            <p>{loadError}</p>
          </div>
        </div>
      )}

      {!loadError && (
        <div className="sheet__scroll-wrap">
          <table className="sheet">
            <thead>
              <tr>
                <th className="sheet__th">Company</th>
                <th className="sheet__th">Niche</th>
                <th className="sheet__th">Tier</th>
                <th className="sheet__th">Company email</th>
                <th className="sheet__th">Industry</th>
                <th className="sheet__th">LinkedIn</th>
                <th className="sheet__th">Instagram</th>
                <th className="sheet__th">Opportunity</th>
                <th className="sheet__th">AI pitch</th>
                <th className="sheet__th">Contact</th>
                <th className="sheet__th">Title</th>
                <th className="sheet__th">Contact email</th>
                <th className="sheet__th">Domain</th>
                <th className="sheet__th">Status</th>
                <th className="sheet__th">Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && (
                <tr>
                  <td className="sheet__cell sheet__cell--empty" colSpan={15}>
                    No rows yet.
                  </td>
                </tr>
              )}
              {leads.map((lead) => {
                const contactName =
                  [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || lead.firstName;
                return (
                  <tr key={lead.id} className="sheet__row">
                    <Cell>{lead.companyName}</Cell>
                    <Cell>
                      <span className="sheet__muted">{lead.nicheSegment ?? "—"}</span>
                    </Cell>
                    <Cell>
                      <span className="sheet__nowrap">{lead.leadTier ?? "—"}</span>
                    </Cell>
                    <Cell>
                      <LinkOrDash href={lead.companyEmail} label={lead.companyEmail ?? undefined} />
                    </Cell>
                    <Cell>{lead.industry}</Cell>
                    <Cell>
                      <LinkOrDash href={lead.linkedinUrl} label="Profile" />
                    </Cell>
                    <Cell>
                      <LinkOrDash href={lead.instagramUrl} label="Profile" />
                    </Cell>
                    <Cell>
                      <span className="sheet__clamp" title={lead.opportunity ?? ""}>
                        {lead.opportunity ?? "—"}
                      </span>
                    </Cell>
                    <Cell variant="pitch">
                      <span className="sheet__clamp sheet__clamp--pitch" title={lead.aiGeneratedPitch}>
                        {lead.aiGeneratedPitch}
                      </span>
                    </Cell>
                    <Cell>{contactName}</Cell>
                    <Cell>
                      <span className="sheet__muted">{lead.jobTitle ?? "—"}</span>
                    </Cell>
                    <Cell>
                      {lead.directEmail ? (
                        <a href={`mailto:${lead.directEmail}`} className="sheet__link">
                          {lead.directEmail}
                        </a>
                      ) : (
                        <span className="sheet__muted">—</span>
                      )}
                    </Cell>
                    <Cell>
                      <span className="sheet__mono">{lead.companyDomain ?? "—"}</span>
                    </Cell>
                    <Cell>
                      <span
                        className="sheet__nowrap"
                        style={{
                          color:
                            lead.status === "Sent" ||
                            lead.status === "PendingSend" ||
                            lead.status === "NoEmail"
                              ? "var(--text, inherit)"
                              : "var(--text-muted, #888)",
                        }}
                      >
                        {lead.status}
                      </span>
                    </Cell>
                    <Cell>
                      <span className="sheet__muted sheet__nowrap">
                        {lead.createdAt.toLocaleDateString(undefined, {
                          year: "2-digit",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
