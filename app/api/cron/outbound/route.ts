import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const APOLLO_API_BASE = "https://api.apollo.io/api/v1";
const APOLLO_SEARCH_PATH = "/mixed_people/api_search";
const APOLLO_MATCH_PATH = "/people/match";
const PACE_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ApolloPerson = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  last_name_obfuscated?: string | null;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  organization?: {
    name?: string | null;
    industry?: string | null;
  } | null;
  organization_name?: string | null;
};

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
  return (p.organization?.industry ?? "E-commerce / F&B / Hospitality").trim() || "General";
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
  p.set("per_page", "20");
  const titles = ["Founder", "Managing Director"];
  for (const t of titles) p.append("person_titles[]", t);
  const locations = [
    "India",
    "Mumbai",
    "Bangalore",
    "Bengaluru",
    "Delhi",
    "Gurgaon",
    "Gurugram",
    "Hyderabad",
    "Chennai",
    "Pune",
    "United States",
    "United Kingdom",
    "London",
  ];
  for (const loc of locations) p.append("person_locations[]", loc);
  const ranges = ["11,20", "21,50", "51,100", "101,200"];
  for (const r of ranges) p.append("organization_num_employees_ranges[]", r);
  return p.toString();
}

async function apolloSearchPeople(): Promise<ApolloPerson[]> {
  const apiKey = getEnv("APOLLO_API_KEY");
  const url = `${APOLLO_API_BASE}${APOLLO_SEARCH_PATH}?${buildApolloSearchQuery()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: apolloHeaders(apiKey),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Apollo search failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as ApolloSearchResponse;
  return data.people ?? data.contacts ?? [];
}

async function apolloMatchEmail(personId: string): Promise<string | null> {
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
  const email =
    (data.person?.email && String(data.person.email).trim()) ||
    (data.email && String(data.email).trim()) ||
    null;
  return email || null;
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

function verifyCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary: {
    startedAt: string;
    searchCount: number;
    sent: number;
    skipped: number;
    errors: { personId?: string; message: string }[];
  } = {
    startedAt: new Date().toISOString(),
    searchCount: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const people = await apolloSearchPeople();
    summary.searchCount = people.length;

    for (let i = 0; i < people.length; i++) {
      await sleep(PACE_MS);

      const person = people[i];
      const personId = person.id;

      try {
        if (!personId) {
          summary.skipped += 1;
          summary.errors.push({ message: "Skipping row with no Apollo person id" });
          continue;
        }

        const email = await apolloMatchEmail(personId);
        if (!email) {
          summary.skipped += 1;
          continue;
        }

        const { firstName, lastName } = parseFullName(person);
        const companyName = companyFromPerson(person);
        const industry = industryFromPerson(person);
        const prospectName = [firstName, lastName].filter(Boolean).join(" ").trim() || firstName;

        const pitch = await generatePitch({
          prospectName,
          companyName,
          industry,
        });

        const resendApiKey = getEnv("RESEND_API_KEY");
        const from = getEnv("RESEND_FROM");
        const resend = new Resend(resendApiKey);
        const subject = `Quick question about ${companyName}'s digital presence`;

        const sendResult = await resend.emails.send({
          from,
          to: email,
          subject,
          text: pitch,
        });

        if (sendResult.error) {
          throw new Error(sendResult.error.message ?? "Resend returned an error");
        }

        await prisma.outboundLead.create({
          data: {
            firstName,
            lastName: lastName || "",
            companyName,
            industry,
            directEmail: email,
            aiGeneratedPitch: pitch,
            status: "Sent",
          },
        });

        summary.sent += 1;
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
