import { KYCStatus } from '../enums';
import { electricianKycStatus } from './electrician-kyc.util';

describe('electrician KYC document requirement', () => {
  it('does not verify an account without Aadhaar even if the legacy status is verified', () => {
    expect(electricianKycStatus({ kycStatus: KYCStatus.VERIFIED })).toBe(KYCStatus.PENDING);
    expect(electricianKycStatus({ aadharFrontImage: '  ' })).toBe(KYCStatus.PENDING);
  });
  it('verifies an uploaded Aadhaar and preserves a reasoned manual rejection', () => {
    expect(electricianKycStatus({ aadharFrontImage: '/uploads/a.jpg' })).toBe(KYCStatus.VERIFIED);
    expect(electricianKycStatus({ aadharFrontImage: '/uploads/a.jpg', kycStatus: KYCStatus.REJECTED, kycRejectionReason: 'Unreadable document' })).toBe(KYCStatus.REJECTED);
  });
  it('does not treat an unexplained legacy rejection as a manual rejection', () => {
    expect(electricianKycStatus({ kycStatus: KYCStatus.REJECTED })).toBe(KYCStatus.PENDING);
  });
});
