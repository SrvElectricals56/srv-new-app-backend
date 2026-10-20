import { KYCStatus } from '../enums';

/** Keep explicit admin decisions; uploaded documents await review by default. */
export function electricianKycStatus(account: {
  aadharFrontImage?: string | null;
  panDocument?: string | null;
  gstDocument?: string | null;
  kycStatus?: KYCStatus;
  kycRejectionReason?: string | null;
}): KYCStatus {
  if (account.kycStatus) return account.kycStatus;
  const hasDocument = [account.aadharFrontImage, account.panDocument, account.gstDocument]
    .some(value => typeof value === 'string' && value.trim().length > 0);
  return hasDocument ? KYCStatus.PENDING : KYCStatus.NOT_SUBMITTED;
}
