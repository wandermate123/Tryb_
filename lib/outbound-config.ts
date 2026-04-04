/** When true, cron saves leads + pitch only; Resend is not called. */
export function isOutboundEmailSendSkipped(): boolean {
  const v = process.env.OUTBOUND_SKIP_EMAIL_SEND?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Delay between Apollo enrich calls (ms). Default: 2s collect-only, 10s when sending mail. */
export function getOutboundPaceMs(): number {
  const raw = process.env.OUTBOUND_PACE_MS?.trim();
  if (raw !== undefined && raw !== "" && !Number.isNaN(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)));
  }
  return isOutboundEmailSendSkipped() ? 2000 : 10_000;
}
