import { KYCStatus } from '../enums';
import { electricianKycStatus } from './electrician-kyc.util';

describe('Manual KYC review', () => {
  it.each(Object.values(KYCStatus))('preserves explicit %s with or without documents', kycStatus => {
    expect(electricianKycStatus({ kycStatus })).toBe(kycStatus);
    expect(electricianKycStatus({ kycStatus, aadharFrontImage: '/uploads/a.jpg' })).toBe(kycStatus);
  });
  it('does not approve a document automatically', () => {
    expect(electricianKycStatus({ aadharFrontImage: '/uploads/a.jpg' })).toBe(KYCStatus.PENDING);
  });
  it('marks an account without KYC evidence as not submitted', () => {
    expect(electricianKycStatus({})).toBe(KYCStatus.NOT_SUBMITTED);
  });
  it.each(['panDocument', 'gstDocument'] as const)('marks an account with %s as pending', field => {
    expect(electricianKycStatus({ [field]: '/uploads/document.jpg' })).toBe(KYCStatus.PENDING);
  });
});
