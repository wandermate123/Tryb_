import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type InboundPayload = Record<string, unknown>;

function normalizeEmail(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/<([^>]+)>/);
  const candidate = (m?.[1] ?? s).trim().toLowerCase();
  if (!candidate.includes("@")) return null;
  return candidate;
}

function getEmailField(payload: InboundPayload, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string") {
      const parsed = normalizeEmail(value);
      if (parsed) return parsed;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== "string") continue;
        const parsed = normalizeEmail(item);
        if (parsed) return parsed;
      }
    }
    if (value && typeof value === "object" && "email" in value) {
      const v = (value as { email?: unknown }).email;
      if (typeof v === "string") {
        const parsed = normalizeEmail(v);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

function getStringField(payload: InboundPayload, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function buildSnippet(text: string | null, html: string | null): string | null {
  const fromText = text?.trim();
  if (fromText) return fromText.slice(0, 500);
  const stripped =
    html
      ?.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? "";
  return stripped ? stripped.slice(0, 500) : null;
}

function verifyInboundWebhookAuth(request: Request): boolean {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!verifyInboundWebhookAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = (await request.json()) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const fromEmail = getEmailField(payload, ["from", "sender", "from_email", "reply_from"]);
  if (!fromEmail) {
    return NextResponse.json({ error: "Could not parse sender email" }, { status: 400 });
  }
  const toEmail = getEmailField(payload, ["to", "recipient", "to_email"]);
  const subject = getStringField(payload, ["subject"]);
  const textBody = getStringField(payload, ["text", "textBody", "text_body", "plain"]);
  const htmlBody = getStringField(payload, ["html", "htmlBody", "html_body"]);
  const messageId = getStringField(payload, ["message_id", "messageId", "id"]);
  const snippet = buildSnippet(textBody, htmlBody);

  const lead = await prisma.outboundLead.findFirst({
    where: {
      OR: [{ directEmail: fromEmail }, { companyEmail: fromEmail }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const reply = await prisma.inboundReply.create({
    data: {
      outboundLeadId: lead?.id,
      fromEmail,
      toEmail: toEmail ?? undefined,
      subject: subject ?? undefined,
      textBody: textBody ?? undefined,
      htmlBody: htmlBody ?? undefined,
      messageId: messageId ?? undefined,
      rawPayload: payload as Prisma.InputJsonValue,
    },
  });

  if (lead?.id) {
    await prisma.outboundLead.update({
      where: { id: lead.id },
      data: {
        status: "Replied",
        repliedAt: new Date(),
        lastReplySnippet: snippet ?? undefined,
        replyCount: { increment: 1 },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    replyId: reply.id,
    matchedLead: Boolean(lead?.id),
  });
}
