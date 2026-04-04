import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getOutboundPaceMs, isOutboundEmailSendSkipped } from "@/lib/outbound-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const APOLLO_API_BASE = "https://api.apollo.io/api/v1";
const APOLLO_SEARCH_PATH = "/mixed_people/api_search";
const APOLLO_MATCH_PATH = "/people/match";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ApolloOrg = {
  name?: string | null;
  industry?: string | null;
  primary_domain?: string | null;
  sanitized_organization_domain?: string | null;
  website_url?: string | null;
};

type ApolloPerson = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  last_name_obfuscated?: string | null;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  organization?: ApolloOrg | null;
  organization_name?: string | null;
};

type ApolloEnrichmentResult = {
  email: string | null;
  linkedinUrl: string | null;
  jobTitle: string | null;
  companyName: string | null;
  industry: string | null;
  companyDomain: string | null;
  companyEmail: string | null;
};

const DEFAULT_OPPORTUNITY =
  "Tryb Studios outbound — digital marketing & branding intro (email sent).";

const OPPORTUNITY_SEND_FAILED =
  "Tryb Studios outbound — pitch generated; email not sent (fix Resend/domain or run again).";

const OPPORTUNITY_COLLECT_ONLY =
  "Tryb Studios outbound — data + pitch saved; email skipped (OUTBOUND_SKIP_EMAIL_SEND). Enable Resend later.";

const OPPORTUNITY_NO_WORK_EMAIL =
  "Tryb Studios outbound — pitch saved; Apollo did not return a work email (credits / coverage). Use LinkedIn or company email.";

const PITCH_FALLBACK =
  "Quick note from Tryb Studios: we help consumer and hospitality brands sharpen digital presence and storytelling. If growth or creative is on your radar this quarter, happy to share how we work with teams like yours.";

type ApolloSearchResponse = {
  people?: ApolloPerson[];
  contacts?: ApolloPerson[];
  pagination?: { page?: number; per_page?: number; total_entries?: number };
};

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function parseFullName(person: ApolloPerson): { firstName: string; lastName: string } {
  const fn = (person.first_name ?? "").trim();
  const ln = (person.last_name ?? "").trim() || (person.last_name_obfuscated ?? "").trim();
  if (fn || ln) return { firstName: fn || "Founder", lastName: ln || "" };
  const full = (person.name ?? "").trim();
  if (!full) return { firstName: "Founder", lastName: "" };
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function companyFromPerson(p: ApolloPerson): string {
  return (
    (p.organization?.name ?? p.organization_name ?? "your company").trim() || "your company"
  );
}

function industryFromPerson(p: ApolloPerson): string {
  return (p.organization?.industry ?? "Consumer brands & hospitality").trim() || "General";
}

function apolloHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "X-Api-Key": apiKey,
  };
}

function buildApolloSearchQuery(): string {
  const p = new URLSearchParams();
  p.set("page", "1");
  p.set("per_page", "25");
  const titles = [
    "CEO",
    "Founder",
    "Co-Founder",
    "Owner",
    "Managing Director",
    "Director",
    "Head of Marketing",
  ];
  for (const t of titles) p.append("person_titles[]", t);

  const hqLocations = [
    "India",
    "United Arab Emirates",
    "United States",
    "United Kingdom",
    "Australia",
  ];
  for (const loc of hqLocations) p.append("organization_locations[]", loc);

  const tag = process.env.APOLLO_INDUSTRY_KEYWORD_TAG?.trim();
  if (tag) p.append("q_organization_keyword_tags[]", tag);

  for (const r of ["1,10", "11,20", "21,50", "51,100", "101,200"]) {
    p.append("organization_num_employees_ranges[]", r);
  }
  return p.toString();
}

/** If the ICP query returns no rows, try a looser search so the sheet can still populate. */
function buildApolloSearchQueryRelaxed(): string {
  const p = new URLSearchParams();
  p.set("page", "1");
  p.set("per_page", "25");
  for (const t of ["Founder", "CEO", "Owner", "Managing Director"]) {
    p.append("person_titles[]", t);
  }
  for (const loc of ["United States", "United Kingdom", "India"]) {
    p.append("person_locations[]", loc);
  }
  return p.toString();
}

function emptyEnrichment(): ApolloEnrichmentResult {
  return {
    email: null,
    linkedinUrl: null,
    jobTitle: null,
    companyName: null,
    industry: null,
    companyDomain: null,
    companyEmail: null,
  };
}

function mergePersonIntoEnrichment(
  person: ApolloPerson,
  enriched: ApolloEnrichmentResult,
): ApolloEnrichmentResult {
  const org = person.organization ?? null;
  return {
    email: enriched.email,
    linkedinUrl: enriched.linkedinUrl ?? person.linkedin_url?.trim() ?? null,
    jobTitle: enriched.jobTitle ?? person.title?.trim() ?? null,
    companyName:
      enriched.companyName ??
      ((org?.name ?? person.organization_name ?? "").trim() || null),
    industry: enriched.industry ?? org?.industry?.trim() ?? null,
    companyDomain:
      enriched.companyDomain ??
      org?.primary_domain?.trim() ??
      org?.sanitized_organization_domain?.trim() ??
      null,
    companyEmail: enriched.companyEmail ?? pickCompanyEmailFromOrg(org),
  };
}

async function apolloSearchPeople(): Promise<ApolloPerson[]> {
  const apiKey = getEnv("APOLLO_API_KEY");

  async function runQuery(query: string, label: string): Promise<ApolloPerson[]> {
    const url = `${APOLLO_API_BASE}${APOLLO_SEARCH_PATH}?${query}`;
    const res = await fetch(url, {
      method: "POST",
      headers: apolloHeaders(apiKey),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Apollo search failed (${label}): ${res.status} ${errText}`);
    }
    const data = (await res.json()) as ApolloSearchResponse;
    return data.people ?? data.contacts ?? [];
  }

  const primary = await runQuery(buildApolloSearchQuery(), "primary");
  if (primary.length > 0) return primary;

  return runQuery(buildApolloSearchQueryRelaxed(), "relaxed");
}

function pickCompanyEmailFromOrg(org: ApolloOrg | null | undefined): string | null {
  if (!org) return null;
  const raw = org as Record<string, unknown>;
  for (const key of [
    "corporate_email",
    "organization_headcount_email",
    "generic_estimate_email",
    "primary_email",
  ]) {
    const v = raw[key];
    if (typeof v === "string" && v.includes("@")) return v.trim();
  }
  return null;
}

async function apolloEnrichPerson(personId: string): Promise<ApolloEnrichmentResult> {
  const apiKey = getEnv("APOLLO_API_KEY");
  const q = new URLSearchParams({
    id: personId,
    reveal_personal_emails: "true",
  });
  const url = `${APOLLO_API_BASE}${APOLLO_MATCH_PATH}?${q.toString()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: apolloHeaders(apiKey),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Apollo match failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { person?: ApolloPerson; email?: string };
  const p = data.person;
  const org = p?.organization ?? null;
  const email =
    (p?.email && String(p.email).trim()) ||
    (data.email && String(data.email).trim()) ||
    null;

  const domain =
    org?.primary_domain?.trim() ||
    org?.sanitized_organization_domain?.trim() ||
    null;

  return {
    email: email || null,
    linkedinUrl: p?.linkedin_url?.trim() || null,
    jobTitle: p?.title?.trim() || null,
    companyName: org?.name?.trim() || null,
    industry: org?.industry?.trim() || null,
    companyDomain: domain,
    companyEmail: pickCompanyEmailFromOrg(org),
  };
}

async function generatePitch(params: {
  prospectName: string;
  companyName: string;
  industry: string;
}): Promise<string> {
  const apiKey = getEnv("GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are the Founder of Tryb Studios, a digital marketing and branding agency.

Write exactly 3 sentences as the body of a cold email to this prospect:
- Prospect name: ${params.prospectName}
- Company: ${params.companyName}
- Industry: ${params.industry}

Pitch Tryb Studios' digital marketing and branding services in a way that feels specific to them (reference their company or industry naturally once).

Rules:
- Casual, direct tone; zero corporate jargon (no "synergy", "leverage", "best-in-class", "circle back", etc.).
- No subject line, no sign-off, no placeholder text — only the 3 sentences of the email body.
- No bullet points. Plain prose only.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  if (!text) throw new Error("Gemini returned empty pitch");
  return text;
}

async function generatePitchSafe(params: {
  prospectName: string;
  companyName: string;
  industry: string;
}): Promise<string> {
  try {
    return await generatePitch(params);
  } catch {
    return PITCH_FALLBACK;
  }
}

function verifyCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  return GET(request);
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emailSendSkipped = isOutboundEmailSendSkipped();
  const paceMs = getOutboundPaceMs();

  const summary: {
    startedAt: string;
    emailSendSkipped: boolean;
    searchCount: number;
    stored: number;
    sent: number;
    skipped: number;
    errors: { personId?: string; message: string }[];
  } = {
    startedAt: new Date().toISOString(),
    emailSendSkipped,
    searchCount: 0,
    stored: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const people = await apolloSearchPeople();
    summary.searchCount = people.length;

    for (let i = 0; i < people.length; i++) {
      if (i > 0 && paceMs > 0) await sleep(paceMs);

      const person = people[i];
      const personId = person.id;

      try {
        if (!personId) {
          summary.skipped += 1;
          summary.errors.push({ message: "Skipping row with no Apollo person id" });
          continue;
        }

        const existing = await prisma.outboundLead.findUnique({
          where: { apolloPersonId: personId },
        });
        if (existing) {
          summary.skipped += 1;
          continue;
        }

        let enriched = emptyEnrichment();
        try {
          enriched = await apolloEnrichPerson(personId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          summary.errors.push({ personId, message: `Apollo match (saved anyway): ${msg}` });
        }
        enriched = mergePersonIntoEnrichment(person, enriched);

        const { firstName, lastName } = parseFullName(person);
        const companyName = enriched.companyName || companyFromPerson(person);
        const industry = enriched.industry || industryFromPerson(person);
        const prospectName = [firstName, lastName].filter(Boolean).join(" ").trim() || firstName;
        const jobTitle = enriched.jobTitle || person.title?.trim() || null;
        const hasWorkEmail = Boolean(enriched.email?.trim());

        const pitch = await generatePitchSafe({
          prospectName,
          companyName,
          industry,
        });

        let emailSent = false;
        let sendError: string | null = null;

        if (!emailSendSkipped && hasWorkEmail) {
          const resendApiKey = getEnv("RESEND_API_KEY");
          const from = getEnv("RESEND_FROM");
          const resend = new Resend(resendApiKey);
          const subject = `Quick question about ${companyName}'s digital presence`;
          try {
            const sendResult = await resend.emails.send({
              from,
              to: enriched.email!,
              subject,
              text: pitch,
            });
            if (sendResult.error) {
              sendError = sendResult.error.message ?? "Resend returned an error";
            } else {
              emailSent = true;
            }
          } catch (err) {
            sendError = err instanceof Error ? err.message : String(err);
          }
        }

        const opportunity = emailSendSkipped
          ? OPPORTUNITY_COLLECT_ONLY
          : emailSent
            ? DEFAULT_OPPORTUNITY
            : !hasWorkEmail
              ? OPPORTUNITY_NO_WORK_EMAIL
              : OPPORTUNITY_SEND_FAILED;

        const status = emailSendSkipped
          ? "PendingSend"
          : emailSent
            ? "Sent"
            : !hasWorkEmail
              ? "NoEmail"
              : "SendFailed";

        await prisma.outboundLead.create({
          data: {
            apolloPersonId: personId,
            firstName,
            lastName: lastName || "",
            companyName,
            industry,
            directEmail: enriched.email?.trim() ? enriched.email.trim() : null,
            jobTitle: jobTitle ?? undefined,
            companyEmail: enriched.companyEmail ?? undefined,
            companyDomain: enriched.companyDomain ?? undefined,
            linkedinUrl: enriched.linkedinUrl ?? undefined,
            opportunity,
            aiGeneratedPitch: pitch,
            status,
          },
        });

        summary.stored += 1;
        if (emailSent) {
          summary.sent += 1;
        } else if (!emailSendSkipped && hasWorkEmail && sendError) {
          summary.errors.push({ personId, message: `Stored lead; email failed: ${sendError}` });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summary.errors.push({ personId: person?.id, message });
        continue;
      }
    }

    return NextResponse.json({
      ok: true,
      ...summary,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        ...summary,
        error: message,
        finishedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
