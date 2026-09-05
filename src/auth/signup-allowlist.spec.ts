import {
  isSignupEmailAllowed,
  loadSignupAllowlistEmails,
} from './signup-allowlist';

describe('signup allowlist', () => {
  it('loads emails from allowlist.json', () => {
    expect(loadSignupAllowlistEmails()).toEqual([
      'tranquocdong9a4@gmail.com',
      'tranquocdong308@gmail.com',
    ]);
  });

  it.each([
    'tranquocdong9a4@gmail.com',
    'tranquocdong308@gmail.com',
    '  TranQuocDong9a4@Gmail.com  ',
  ])('allows %s', (email) => {
    expect(isSignupEmailAllowed(email)).toBe(true);
  });

  it.each([undefined, null, '', '   ', 'someone@example.com'])(
    'rejects %p',
    (email) => {
      expect(isSignupEmailAllowed(email)).toBe(false);
    },
  );
});
