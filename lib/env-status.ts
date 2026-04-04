import { isOutboundEmailSendSkipped } from "@/lib/outbound-config";

export type EnvConfigurationStatus = {
  databaseUrl: boolean;
  directUrl: boolean;
  apolloApiKey: boolean;
  geminiApiKey: boolean;
  resendApiKey: boolean;
  resendFrom: boolean;
  cronSecret: boolean;
};

function defined(v: string | undefined): boolean {
  return Boolean(v?.trim().length);
}

export function getEnvConfigurationStatus(): EnvConfigurationStatus {
  return {
    databaseUrl: defined(process.env.DATABASE_URL),
    directUrl: defined(process.env.DIRECT_URL),
    apolloApiKey: defined(process.env.APOLLO_API_KEY),
    geminiApiKey: defined(process.env.GEMINI_API_KEY),
    resendApiKey: defined(process.env.RESEND_API_KEY),
    resendFrom: defined(process.env.RESEND_FROM),
    cronSecret: defined(process.env.CRON_SECRET),
  };
}

export function isOutboundReady(status: EnvConfigurationStatus): boolean {
  const skipEmail = isOutboundEmailSendSkipped();
  return (
    status.databaseUrl &&
    status.directUrl &&
    status.apolloApiKey &&
    status.geminiApiKey &&
    (skipEmail || (status.resendApiKey && status.resendFrom))
  );
}

/** Variable names to show when the run button stays disabled (no secrets leaked). */
export function getMissingOutboundEnvNames(status: EnvConfigurationStatus): string[] {
  const skipEmail = isOutboundEmailSendSkipped();
  const pairs: [keyof EnvConfigurationStatus, string][] = [
    ["databaseUrl", "DATABASE_URL"],
    ["directUrl", "DIRECT_URL"],
    ["apolloApiKey", "APOLLO_API_KEY"],
    ["geminiApiKey", "GEMINI_API_KEY"],
    ...(!skipEmail
      ? ([
          ["resendApiKey", "RESEND_API_KEY"],
          ["resendFrom", "RESEND_FROM"],
        ] as [keyof EnvConfigurationStatus, string][])
      : []),
  ];
  return pairs.filter(([key]) => !status[key]).map(([, label]) => label);
}
