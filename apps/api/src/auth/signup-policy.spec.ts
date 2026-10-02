import {
  getAllowedEmailDomains,
  isEmailDomainAllowed,
  isSignUpAllowed,
  isSignUpRestricted,
} from './signup-policy';

const env = { AUTH_ALLOWED_EMAIL_DOMAINS: 'example.com, @Other.org ' };
const noInvitation = async () => false;
const invited = async () => true;

describe('signup-policy', () => {
  it('parses the domain list (trim, lowercase, leading @)', () => {
    expect(getAllowedEmailDomains(env)).toEqual(['example.com', 'other.org']);
    expect(getAllowedEmailDomains({})).toEqual([]);
  });

  it('is unrestricted when the variable is unset or empty', async () => {
    expect(isSignUpRestricted({})).toBe(false);
    expect(isSignUpRestricted({ AUTH_ALLOWED_EMAIL_DOMAINS: ' , ' })).toBe(
      false,
    );
    await expect(
      isSignUpAllowed({
        email: 'anyone@anywhere.io',
        hasPendingInvitation: noInvitation,
        env: {},
      }),
    ).resolves.toBe(true);
  });

  it('matches the whole domain, case-insensitively', () => {
    const domains = getAllowedEmailDomains(env);
    expect(isEmailDomainAllowed('a@example.com', domains)).toBe(true);
    expect(isEmailDomainAllowed('A@EXAMPLE.COM', domains)).toBe(true);
    expect(isEmailDomainAllowed('a@other.org', domains)).toBe(true);
  });

  it('rejects look-alike domains and malformed emails', () => {
    const domains = getAllowedEmailDomains(env);
    expect(isEmailDomainAllowed('a@evilexample.com', domains)).toBe(false);
    expect(isEmailDomainAllowed('a@example.com.evil.io', domains)).toBe(false);
    expect(isEmailDomainAllowed('a@sub.example.com', domains)).toBe(false);
    expect(isEmailDomainAllowed('example.com@evil.io', domains)).toBe(false);
    expect(isEmailDomainAllowed('@example.com', domains)).toBe(false);
    expect(isEmailDomainAllowed('example.com', domains)).toBe(false);
  });

  it('allows an outside email only with a pending invitation', async () => {
    await expect(
      isSignUpAllowed({
        email: 'auditor@firm.com',
        hasPendingInvitation: noInvitation,
        env,
      }),
    ).resolves.toBe(false);
    await expect(
      isSignUpAllowed({
        email: 'auditor@firm.com',
        hasPendingInvitation: invited,
        env,
      }),
    ).resolves.toBe(true);
  });

  it('does not look up invitations for an allowed domain', async () => {
    const lookup = jest.fn(noInvitation);
    await expect(
      isSignUpAllowed({
        email: 'a@example.com',
        hasPendingInvitation: lookup,
        env,
      }),
    ).resolves.toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });
});
