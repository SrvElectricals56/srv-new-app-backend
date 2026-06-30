export interface OtpRuntimeConfig {
  nodeEnv?: string;
  appEnv?: string;
  testMode?: string;
  testCode?: string;
}

const VALID_OTP = /^\d{4,6}$/;

/**
 * Returns a fixed OTP only for local development or an explicitly configured
 * staging deployment. Production can never enable the staging test code.
 */
export function resolveFixedOtp(config: OtpRuntimeConfig): string | null {
  if (config.nodeEnv === 'development') {
    const developmentCode = config.testCode?.trim() || '1234';
    if (!VALID_OTP.test(developmentCode)) {
      throw new Error('OTP_TEST_CODE must contain 4 to 6 digits.');
    }
    return developmentCode;
  }

  if (config.appEnv !== 'staging' || config.testMode !== 'true') {
    return null;
  }

  const stagingCode = config.testCode?.trim();
  if (!stagingCode || !VALID_OTP.test(stagingCode)) {
    throw new Error(
      'OTP_TEST_CODE must contain 4 to 6 digits when staging OTP test mode is enabled.',
    );
  }

  return stagingCode;
}
