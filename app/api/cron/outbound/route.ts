import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  getOutboundMaxContactsPerRun,
  getOutboundPaceMs,
  isOutboundEmailSendSkipped,
} from "@/lib/outbound-config";
import { NICHE_SEARCH_ORDER, type NicheDefinition } from "@/lib/outbound-niches";
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
  facebook_url?: string | null;
  linkedin_url?: string | null;
  twitter_url?: string | null;
  instagram_url?: string | null;
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
  facebook_url?: string | null;
  twitter_url?: string | null;
  instagram_url?: string | null;
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
  instagramUrl: string | null;
};

const TRYB_EMAIL_SIGN_OFF = `Best,
Kabir
Tryb Studios (www.trybstudios.com)`;

function buildPitchFallback(
  prospectFirstName: string,
  companyName: string,
  nicheLabel: string,
): string {
  return `${greetingLine(prospectFirstName)}

I'm Kabir — I run a creative studio called Tryb Studios where we work on cinematic visuals and digital storytelling for brands.

I recently came across ${companyName} while looking at ${nicheLabel.toLowerCase()} brands, and the way you show up visually made me want to reach out.

I had a couple of ideas around campaign-style product storytelling — things like motion-led hero moments, richer texture and ingredient visuals, or short product films that feel more cinematic alongside your existing content.

If you're open to it, I'd be happy to share a few concepts, and if helpful we could also jump on a quick call to discuss them.

${TRYB_EMAIL_SIGN_OFF}`;
}

function greetingLine(firstName: string): string {
  const f = firstName.trim();
  if (!f || f.toLowerCase() === "founder") return "Hi,";
  return `Hi ${f},`;
}

/** Strip any model-provided closing so the sent email always uses the canonical Tryb sign-off. */
function normalizeOutboundEmailBody(body: string): string {
  const lines = body.trim().split(/\r?\n/);
  const bestIdx = lines.findIndex((line) => /^\s*Best,/i.test(line));
  const t =
    bestIdx === -1 ? body.trim() : lines.slice(0, bestIdx).join("\n").trim();
  return `${t}\n\n${TRYB_EMAIL_SIGN_OFF}`;
}

const OPPORTUNITY_FALLBACK = (niche: string) =>
  `${niche} — product visuals, performance creative, and digital storytelling`;

/** SOP: company size ~10–200; exclude 1–10 employee micro-brands from Apollo ranges. */
const EMPLOYEE_RANGES_SOP = ["11,20", "21,50", "51,100", "101,200"] as const;

type PersonWithNiche = { person: ApolloPerson; nicheLabel: string };

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

function buildApolloSearchQueryForNiche(niche: NicheDefinition): string {
  const p = new URLSearchParams();
  p.set("page", "1");
  p.set("per_page", String(niche.perPage));
  const titles = [
    "CEO",
    "Founder",
    "Co-Founder",
    "CMO",
    "Head of Marketing",
    "Marketing Director",
    "Brand Manager",
    "Managing Director",
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

  for (const tag of niche.keywordTags) {
    p.append("q_organization_keyword_tags[]", tag);
  }
  const extra = process.env.APOLLO_INDUSTRY_KEYWORD_TAG?.trim();
  if (extra) p.append("q_organization_keyword_tags[]", extra);

  for (const r of EMPLOYEE_RANGES_SOP) {
    p.append("organization_num_employees_ranges[]", r);
  }
  return p.toString();
}

/** If niche searches return no rows, broader ICP pull (still product/hospitality skew). */
function buildApolloSearchQueryRelaxed(): string {
  const p = new URLSearchParams();
  p.set("page", "1");
  p.set("per_page", "25");
  for (const t of [
    "Founder",
    "CEO",
    "Co-Founder",
    "CMO",
    "Head of Marketing",
    "Brand Manager",
  ]) {
    p.append("person_titles[]", t);
  }
  for (const loc of ["United States", "United Kingdom", "India", "United Arab Emirates", "Australia"]) {
    p.append("organization_locations[]", loc);
  }
  for (const tag of ["beauty", "cosmetics", "food and beverage", "coffee", "boutique hotel"]) {
    p.append("q_organization_keyword_tags[]", tag);
  }
  for (const r of EMPLOYEE_RANGES_SOP) {
    p.append("organization_num_employees_ranges[]", r);
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
    instagramUrl: null,
  };
}

function firstEmailLike(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.includes("@")) return v.trim();
  }
  return null;
}

/** Normalize Instagram URL or @handle from Apollo (field names vary by endpoint). */
function normalizeInstagramUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  if (/instagram\.com\//i.test(s)) {
    return s.startsWith("http") ? s : `https://${s.replace(/^\/\//, "")}`;
  }
  const handle = s.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").split(/[/?#]/)[0];
  if (handle && /^[a-z0-9._]+$/i.test(handle)) return `https://www.instagram.com/${handle}/`;
  return null;
}

function pickInstagramUrl(person: ApolloPerson, org: ApolloOrg | null | undefined): string | null {
  const p = person as Record<string, unknown>;
  const o = org as Record<string, unknown> | null | undefined;
  const keys = [
    "instagram_url",
    "instagram_handle",
    "organization_instagram_url",
    "company_instagram_url",
    "primary_instagram_url",
  ];
  for (const key of keys) {
    const v = p[key];
    if (typeof v === "string") {
      const n = normalizeInstagramUrl(v);
      if (n) return n;
    }
  }
  if (o) {
    for (const key of keys) {
      const v = o[key];
      if (typeof v === "string") {
        const n = normalizeInstagramUrl(v);
        if (n) return n;
      }
    }
  }
  return null;
}

function pickCompanyEmailFromOrg(org: ApolloOrg | null | undefined): string | null {
  if (!org) return null;
  const raw = org as Record<string, unknown>;
  return firstEmailLike(raw, [
    "corporate_email",
    "organization_headcount_email",
    "generic_estimate_email",
    "primary_email",
    "email",
    "company_email",
    "organization_email",
    "estimated_email",
    "sic_email",
  ]);
}

function pickCompanyEmailFromPerson(person: ApolloPerson | null | undefined): string | null {
  if (!person) return null;
  return firstEmailLike(person as Record<string, unknown>, [
    "corporate_email",
    "organization_email",
    "account_email",
    "company_email",
  ]);
}

/** When Apollo has no corporate email but we have a domain — common outreach placeholder (verify before relying on it). */
function inferCompanyEmailFromDomain(domain: string | null | undefined): string | null {
  const raw = domain?.trim().toLowerCase().replace(/^www\./, "").split("/")[0] ?? "";
  if (!raw || !raw.includes(".") || raw.length < 3) return null;
  if (raw === "linkedin.com" || raw.endsWith("wordpress.com")) return null;
  return `hello@${raw}`;
}

function mergePersonIntoEnrichment(
  person: ApolloPerson,
  enriched: ApolloEnrichmentResult,
): ApolloEnrichmentResult {
  const org = person.organization ?? null;
  const ig = enriched.instagramUrl ?? pickInstagramUrl(person, org);
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
    companyEmail:
      enriched.companyEmail ??
      pickCompanyEmailFromOrg(org) ??
      pickCompanyEmailFromPerson(person),
    instagramUrl: ig,
  };
}

async function apolloSearchPeople(): Promise<PersonWithNiche[]> {
  const apiKey = getEnv("APOLLO_API_KEY");
  const max = getOutboundMaxContactsPerRun();

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

  const merged: PersonWithNiche[] = [];
  const seen = new Set<string>();

  for (const niche of NICHE_SEARCH_ORDER) {
    const people = await runQuery(buildApolloSearchQueryForNiche(niche), niche.key);
    for (const person of people) {
      const id = person.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push({ person, nicheLabel: niche.label });
    }
  }

  if (merged.length > 0) {
    return merged.slice(0, max);
  }

  const relaxed = await runQuery(buildApolloSearchQueryRelaxed(), "relaxed");
  return relaxed
    .filter((p) => p.id)
    .slice(0, max)
    .map((person) => ({
      person,
      nicheLabel: "Mixed ICP (relaxed)",
    }));
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
    companyEmail: pickCompanyEmailFromOrg(org) ?? pickCompanyEmailFromPerson(p ?? undefined),
    instagramUrl: p ? pickInstagramUrl(p, org) : null,
  };
}

async function generatePitch(params: {
  prospectFirstName: string;
  companyName: string;
  industry: string;
  nicheLabel: string;
}): Promise<string> {
  const apiKey = getEnv("GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const open = greetingLine(params.prospectFirstName);

  const prompt = `You are Kabir, founder of Tryb Studios (creative studio: cinematic visuals, digital storytelling, product and campaign content for brands).

Write the FULL plain-text body of a short cold email — same voice and structure as these real examples:
- Start warm and specific: show you understand ${params.companyName} (or their category); praise something concrete you can infer from "${params.industry}" / "${params.nicheLabel}" — not generic flattery.
- Lead with THEM and visual/creative ideas; Tryb appears as a brief, natural aside (one short sentence), not a pitch deck.
- Offer specific creative directions that fit the segment (e.g. for beauty: ingredient micro-visualizations, cinematic product rituals, lab-to-texture storytelling, barrier/science motion; for F&B: stylised pack shots, surreal/3D product worlds, motion-led social; for hospitality: immersive digital launch moments, richer booking-site storytelling). Pick what fits ${params.companyName}.
- Tone: conversational, professional, confident, never salesy. Sounds like a thoughtful peer, not marketing jargon. Avoid: synergy, leverage, best-in-class, circle back, touch base, solutions, cutting-edge, game-changer, hustle.
- Short paragraphs only (1–2 sentences each), separated by a blank line. No bullet points. No numbered lists. No subject line.
- Optional: one low-pressure CTA — happy to share a couple of visual concepts, or sketch ideas, or a quick call *if helpful* (mirrors Kabir's real outreach).
- Do NOT invent that you use their products unless it's plausible from context; you may say you have been following the brand or came across them recently.

Exact first line of the email must be: ${open}

Do NOT include a sign-off, name, or website — the app adds that. End on the last paragraph before "Best,".`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  if (!text) throw new Error("Gemini returned empty pitch");
  return normalizeOutboundEmailBody(text);
}

async function generatePitchSafe(params: {
  prospectFirstName: string;
  companyName: string;
  industry: string;
  nicheLabel: string;
}): Promise<string> {
  try {
    return await generatePitch(params);
  } catch {
    return buildPitchFallback(params.prospectFirstName, params.companyName, params.nicheLabel);
  }
}

async function generateOpportunityLine(params: {
  companyName: string;
  industry: string;
  nicheLabel: string;
}): Promise<string> {
  const apiKey = getEnv("GEMINI_API_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Tryb Studios helps D2C product brands and boutique hotels with product creative, performance ads, and digital storytelling.

For this lead, output ONE short opportunity phrase (max 12 words) — like "cinematic product ads" or "booking-site visual refresh". Noun phrase only; no quotes; no "we"; no colon.

Company: ${params.companyName}
Industry: ${params.industry}
Segment: ${params.nicheLabel}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim().replace(/^["']|["']$/g, "").replace(/\n/g, " ");
  if (!text) throw new Error("Gemini returned empty opportunity");
  return text.slice(0, 220);
}

async function generateOpportunityLineSafe(params: {
  companyName: string;
  industry: string;
  nicheLabel: string;
}): Promise<string> {
  try {
    return await generateOpportunityLine(params);
  } catch {
    return OPPORTUNITY_FALLBACK(params.nicheLabel);
  }
}

async function generateLeadTierSafe(params: {
  companyName: string;
  industry: string;
  nicheLabel: string;
  jobTitle: string | null;
}): Promise<string> {
  try {
    const apiKey = getEnv("GEMINI_API_KEY");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `You cannot see Instagram followers or Meta Ad Library. Guess lead tier for a creative studio selling product visuals and performance creative.

1 = strongest (premium D2C/hospitality signals, likely spends on marketing, senior title)
2 = solid professional brand
3 = smaller or generic

Company: ${params.companyName}
Industry: ${params.industry}
Segment: ${params.nicheLabel}
Title: ${params.jobTitle ?? "unknown"}

Reply with exactly one digit: 1, 2, or 3.`;
    const text = (await model.generateContent(prompt)).response.text().trim();
    const m = text.match(/[123]/);
    return m ? m[0]! : "2";
  } catch {
    return "2";
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

      const { person, nicheLabel } = people[i];
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
        const jobTitle = enriched.jobTitle || person.title?.trim() || null;
        const hasWorkEmail = Boolean(enriched.email?.trim());

        let companyEmail = enriched.companyEmail?.trim() || null;
        if (!companyEmail && enriched.companyDomain) {
          companyEmail = inferCompanyEmailFromDomain(enriched.companyDomain);
        }
        const instagramUrl = enriched.instagramUrl?.trim() || null;

        const [leadTierVal, icpOpportunity, pitch] = await Promise.all([
          generateLeadTierSafe({ companyName, industry, nicheLabel, jobTitle }),
          generateOpportunityLineSafe({ companyName, industry, nicheLabel }),
          generatePitchSafe({ prospectFirstName: firstName, companyName, industry, nicheLabel }),
        ]);

        let emailSent = false;
        let sendError: string | null = null;

        if (!emailSendSkipped && hasWorkEmail) {
          const resendApiKey = getEnv("RESEND_API_KEY");
          const from = getEnv("RESEND_FROM");
          const resend = new Resend(resendApiKey);
          const subject = `A quick note — ${companyName}`;
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
          ? `${icpOpportunity} (send skipped)`
          : emailSent
            ? icpOpportunity
            : !hasWorkEmail
              ? `${icpOpportunity} (no work email from Apollo — use LinkedIn or company email)`
              : `${icpOpportunity} (Resend send failed — check domain & RESEND_FROM)`;

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
            companyEmail: companyEmail ?? undefined,
            companyDomain: enriched.companyDomain ?? undefined,
            linkedinUrl: enriched.linkedinUrl ?? undefined,
            instagramUrl: instagramUrl ?? undefined,
            nicheSegment: nicheLabel,
            leadTier: leadTierVal,
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
