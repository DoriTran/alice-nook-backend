import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SIGNUP_NOT_ALLOWED_CODE = 'SIGNUP_NOT_ALLOWED';
export const SIGNUP_NOT_ALLOWED_MESSAGE =
  'Website is still in beta, registered user only';

const ALLOWLIST_FILENAME = 'allowlist.json';

type SignupAllowlistFile = {
  emails: string[];
};

export function normalizeSignupEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function resolveSignupAllowlistPath(): string {
  const candidates = [
    join(__dirname, ALLOWLIST_FILENAME),
    join(process.cwd(), 'src', 'auth', ALLOWLIST_FILENAME),
    join(process.cwd(), 'auth', ALLOWLIST_FILENAME),
  ];
  const match = candidates.find((path) => existsSync(path));
  if (!match) {
    throw new Error(`Signup allowlist file not found: ${ALLOWLIST_FILENAME}`);
  }
  return match;
}

export function loadSignupAllowlistEmails(): string[] {
  const parsed = JSON.parse(
    readFileSync(resolveSignupAllowlistPath(), 'utf8'),
  ) as unknown;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as SignupAllowlistFile).emails) ||
    !(parsed as SignupAllowlistFile).emails.every(
      (email) => typeof email === 'string',
    )
  ) {
    throw new Error('allowlist.json must contain an "emails" array of strings');
  }

  return (parsed as SignupAllowlistFile).emails
    .map(normalizeSignupEmail)
    .filter(Boolean);
}

export function isSignupEmailAllowed(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return loadSignupAllowlistEmails().includes(normalizeSignupEmail(email));
}
