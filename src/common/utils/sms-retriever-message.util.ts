export function buildSmsRetrieverMessage(otp: string, appHash: string): string {
  if (!/^\d{4}$/.test(otp)) throw new Error('SMS Retriever OTP must be four digits');
  if (!/^[A-Za-z0-9+/]{11}$/.test(appHash)) throw new Error('SMS Retriever app hash must be 11 characters');

  const message = `<#> SRV Electricals OTP: ${otp}. Valid for 2 minutes. Do not share.\n${appHash}`;
  if (Buffer.byteLength(message, 'utf8') > 140) {
    throw new Error('SMS Retriever message exceeds 140 bytes');
  }
  return message;
}
