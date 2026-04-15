/** When true, cron saves leads + pitch only; Resend is not called. */
export function isOutboundEmailSendSkipped(): boolean {
  const v = process.env.OUTBOUND_SKIP_EMAIL_SEND?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Delay between Apollo enrich calls (ms). Default: 2s collect-only, 10s when sending mail. */
export function getOutboundPaceMs(emailSendSkipped = isOutboundEmailSendSkipped()): number {
  const raw = process.env.OUTBOUND_PACE_MS?.trim();
  if (raw !== undefined && raw !== "" && !Number.isNaN(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)));
  }
  return emailSendSkipped ? 2000 : 10_000;
}

/**
 * Max contacts processed per cron/manual run (after niche merge + dedupe).
 * SOP targets ~75/day; with ~10s pace and 300s serverless cap, use multiple runs/day or lower pace.
 */
export function getOutboundMaxContactsPerRun(): number {
  const raw = process.env.OUTBOUND_MAX_CONTACTS_PER_RUN?.trim();
  if (raw !== undefined && raw !== "" && !Number.isNaN(Number(raw))) {
    return Math.max(50, Math.min(150, Math.floor(Number(raw))));
  }
  return 50;
}
