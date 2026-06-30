import { resolveFixedOtp } from './otp-policy.util';

describe('resolveFixedOtp', () => {
  it('uses 1234 by default in local development', () => {
    expect(resolveFixedOtp({ nodeEnv: 'development' })).toBe('1234');
  });

  it('uses the configured code only in explicit staging test mode', () => {
    expect(
      resolveFixedOtp({
        nodeEnv: 'production',
        appEnv: 'staging',
        testMode: 'true',
        testCode: '1234',
      }),
    ).toBe('1234');
  });

  it('never enables the test code for production deployments', () => {
    expect(
      resolveFixedOtp({
        nodeEnv: 'production',
        appEnv: 'production',
        testMode: 'true',
        testCode: '1234',
      }),
    ).toBeNull();
  });

  it('requires an explicit test-mode flag in staging', () => {
    expect(
      resolveFixedOtp({
        nodeEnv: 'production',
        appEnv: 'staging',
        testMode: 'false',
        testCode: '1234',
      }),
    ).toBeNull();
  });

  it('rejects malformed fixed codes', () => {
    expect(() =>
      resolveFixedOtp({
        nodeEnv: 'production',
        appEnv: 'staging',
        testMode: 'true',
        testCode: '12AB',
      }),
    ).toThrow('OTP_TEST_CODE');
  });
});
