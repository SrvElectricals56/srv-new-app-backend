import { KYCStatus } from '../enums';

/** An upload is required for verification; only an explicit admin rejection rejects KYC. */
export function electricianKycStatus(
  account: { aadharFrontImage?: string | null; kycStatus?: KYCStatus; kycRejectionReason?: string | null },
): KYCStatus {
  if (account.kycStatus === KYCStatus.REJECTED && account.kycRejectionReason?.trim()
    && account.kycRejectionReason.trim() !== 'Imported legacy KYC status') return KYCStatus.REJECTED;
  return account.aadharFrontImage?.trim() ? KYCStatus.VERIFIED : KYCStatus.PENDING;
}
