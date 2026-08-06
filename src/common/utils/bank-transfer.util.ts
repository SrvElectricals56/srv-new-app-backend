type BankTransferDetails = {
  bankLinked?: boolean | null;
  accountHolderName?: string | null;
  upiId?: string | null;
  bankAccount?: string | null;
};

export function hasBankTransferDestination(details?: BankTransferDetails | null): boolean {
  if (!details?.bankLinked || !details.accountHolderName?.trim()) return false;
  return Boolean(details.upiId?.trim() || details.bankAccount?.trim());
}
