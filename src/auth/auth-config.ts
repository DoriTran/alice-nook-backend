export type AuthEnvironment = NodeJS.ProcessEnv;

export type AuthRuntimeConfig = {
  baseURL: string;
  trustedOrigins: string[];
  google?: {
    clientId: string;
    clientSecret: string;
  };
};

const requireValue = (environment: AuthEnvironment, name: string): string => {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to initialize authentication`);
  }
  return value;
};

export function getAuthRuntimeConfig(
  environment: AuthEnvironment = process.env,
): AuthRuntimeConfig {
  requireValue(environment, 'DATABASE_URL');
  requireValue(environment, 'BETTER_AUTH_SECRET');

  const baseURL = requireValue(environment, 'BETTER_AUTH_URL');
  const frontendURL = requireValue(environment, 'FRONTEND_URL');
  const googleClientId = environment.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = environment.GOOGLE_CLIENT_SECRET?.trim();

  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together',
    );
  }

  if (
    environment.NODE_ENV === 'production' &&
    (!googleClientId || !googleClientSecret)
  ) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production',
    );
  }

  return {
    baseURL,
    trustedOrigins: [frontendURL],
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {}),
  };
}
