/**
 * Optional sign-up restriction for self-hosted installs.
 *
 * When AUTH_ALLOWED_EMAIL_DOMAINS is set (comma-separated, e.g. "example.com"),
 * a new account can only be created for an email on one of those domains or
 * for an email that has a pending, unexpired organization invitation.
 * When it is unset, sign-up is unrestricted.
 */

export function getAllowedEmailDomains(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): string[] {
  return (env.AUTH_ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter((domain) => domain.length > 0);
}

export function isSignUpRestricted(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return getAllowedEmailDomains(env).length > 0;
}

/** Exact domain match — never a suffix match, so look-alike domains fail. */
export function isEmailDomainAllowed(
  email: string,
  allowedDomains: string[],
): boolean {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0) return false;
  const domain = normalized.slice(atIndex + 1);
  return domain.length > 0 && allowedDomains.includes(domain);
}

export async function isSignUpAllowed(params: {
  email: string;
  hasPendingInvitation: (email: string) => Promise<boolean>;
  env?: Partial<NodeJS.ProcessEnv>;
}): Promise<boolean> {
  const { email, hasPendingInvitation, env = process.env } = params;
  const allowedDomains = getAllowedEmailDomains(env);
  if (allowedDomains.length === 0) return true;
  if (isEmailDomainAllowed(email, allowedDomains)) return true;
  return hasPendingInvitation(email.trim());
}
