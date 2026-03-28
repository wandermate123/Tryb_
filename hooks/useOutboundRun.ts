"use client";

import { useCallback, useState } from "react";

export type OutboundRunSummary = {
  ok?: boolean;
  sent?: number;
  skipped?: number;
  searchCount?: number;
  errors?: { personId?: string; message: string }[];
  error?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type OutboundRunState = {
  loading: boolean;
  statusCode: number | null;
  raw: string | null;
  summary: OutboundRunSummary | null;
};

export function useOutboundRun(requiresCronAuth: boolean) {
  const [state, setState] = useState<OutboundRunState>({
    loading: false,
    statusCode: null,
    raw: null,
    summary: null,
  });

  const run = useCallback(
    async (bearer: string) => {
      setState({
        loading: true,
        statusCode: null,
        raw: null,
        summary: null,
      });
      try {
        const headers: HeadersInit = {};
        if (requiresCronAuth && bearer.trim()) {
          headers.Authorization = `Bearer ${bearer.trim()}`;
        }
        const res = await fetch("/api/cron/outbound", { method: "GET", headers });
        const text = await res.text();
        let summary: OutboundRunSummary | null = null;
        try {
          const parsed = JSON.parse(text) as OutboundRunSummary;
          summary = parsed;
        } catch {
          /* keep summary null */
        }
        setState({
          loading: false,
          statusCode: res.status,
          raw: text,
          summary,
        });
      } catch (e) {
        setState({
          loading: false,
          statusCode: 0,
          raw: e instanceof Error ? e.message : String(e),
          summary: null,
        });
      }
    },
    [requiresCronAuth]
  );

  return { ...state, run };
}
