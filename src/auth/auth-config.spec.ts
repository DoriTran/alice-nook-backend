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

  it('includes Google only when both credentials are configured', () => {
    expect(
      getAuthRuntimeConfig({
        ...baseEnvironment,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      }).google,
    ).toEqual({ clientId: 'client-id', clientSecret: 'client-secret' });
  });

  it('rejects a partially configured Google provider', () => {
    expect(() =>
      getAuthRuntimeConfig({
        ...baseEnvironment,
        GOOGLE_CLIENT_ID: 'client-id',
      }),
    ).toThrow('must be configured together');
  });

  it('requires Google credentials in production', () => {
    expect(() =>
      getAuthRuntimeConfig({ ...baseEnvironment, NODE_ENV: 'production' }),
    ).toThrow('required in production');
  });

  it.each([
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'FRONTEND_URL',
  ])('requires %s', (name) => {
    const environment = { ...baseEnvironment, [name]: '' };
    expect(() => getAuthRuntimeConfig(environment)).toThrow(`${name} is required`);
  });
});
