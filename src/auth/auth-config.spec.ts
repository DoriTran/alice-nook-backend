import { getAuthRuntimeConfig } from './auth-config';

const baseEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://example.invalid/database',
  BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters',
  BETTER_AUTH_URL: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:8888',
};

describe('getAuthRuntimeConfig', () => {
  it('configures the backend URL and trusted frontend origin', () => {
    expect(getAuthRuntimeConfig(baseEnvironment)).toEqual({
      baseURL: 'http://localhost:3000',
      trustedOrigins: ['http://localhost:8888'],
    });
  });

  it('disables Google in production when neither credential is configured', () => {
    expect(
      getAuthRuntimeConfig({ ...baseEnvironment, NODE_ENV: 'production' }),
    ).toEqual({
      baseURL: 'http://localhost:3000',
      trustedOrigins: ['http://localhost:8888'],
    });
  });

  it('enables Google in production when both credentials are configured', () => {
    expect(
      getAuthRuntimeConfig({
        ...baseEnvironment,
        NODE_ENV: 'production',
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      }).google,
    ).toEqual({ clientId: 'client-id', clientSecret: 'client-secret' });
  });

  it.each([
    { GOOGLE_CLIENT_ID: 'client-id' },
    { GOOGLE_CLIENT_SECRET: 'client-secret' },
  ])('rejects one Google credential in production', (googleEnvironment) => {
    expect(() =>
      getAuthRuntimeConfig({
        ...baseEnvironment,
        NODE_ENV: 'production',
        ...googleEnvironment,
      }),
    ).toThrow(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together',
    );
  });

  it.each([
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'FRONTEND_URL',
  ])('requires %s', (name) => {
    const environment = { ...baseEnvironment, [name]: '' };
    expect(() => getAuthRuntimeConfig(environment)).toThrow(
      `${name} is required`,
    );
  });
});
