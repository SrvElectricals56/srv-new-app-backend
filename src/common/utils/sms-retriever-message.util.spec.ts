import { buildSmsRetrieverMessage } from './sms-retriever-message.util';

describe('buildSmsRetrieverMessage', () => {
  it('makes a four-digit message with the app hash within the SMS Retriever limit', () => {
    const message = buildSmsRetrieverMessage('1234', 'FA+9qCX9VSu');
    expect(message).toBe('<#> SRV Electricals OTP: 1234. Valid for 2 minutes. Do not share.\nFA+9qCX9VSu');
    expect(Buffer.byteLength(message, 'utf8')).toBeLessThanOrEqual(140);
  });

  it('rejects an invalid code or signing hash', () => {
    expect(() => buildSmsRetrieverMessage('12345', 'FA+9qCX9VSu')).toThrow();
    expect(() => buildSmsRetrieverMessage('1234', 'invalid')).toThrow();
  });
});
