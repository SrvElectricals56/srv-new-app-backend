import { KYCStatus } from '../enums';

/** Keep explicit admin decisions; documents await review by default. */
export function electricianKycStatus(account: {
  aadharFrontImage?: string | null; kycStatus?: KYCStatus; kycRejectionReason?: string | null;
}): KYCStatus {
  return account.kycStatus ?? KYCStatus.PENDING;
}
