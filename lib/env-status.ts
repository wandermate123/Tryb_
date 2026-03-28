export type EnvConfigurationStatus = {
  databaseUrl: boolean;
  apolloApiKey: boolean;
  geminiApiKey: boolean;
  resendApiKey: boolean;
  resendFrom: boolean;
  cronSecret: boolean;
};

export function getEnvConfigurationStatus(): EnvConfigurationStatus {
  return {
    databaseUrl: Boolean(process.env.DATABASE_URL?.length),
    apolloApiKey: Boolean(process.env.APOLLO_API_KEY?.length),
    geminiApiKey: Boolean(process.env.GEMINI_API_KEY?.length),
    resendApiKey: Boolean(process.env.RESEND_API_KEY?.length),
    resendFrom: Boolean(process.env.RESEND_FROM?.length),
    cronSecret: Boolean(process.env.CRON_SECRET?.length),
  };
}

export function isOutboundReady(status: EnvConfigurationStatus): boolean {
  return (
    status.databaseUrl &&
    status.apolloApiKey &&
    status.geminiApiKey &&
    status.resendApiKey &&
    status.resendFrom
  );
}
