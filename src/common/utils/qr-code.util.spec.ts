import { extractQrCodeCandidates } from './qr-code.util';

describe('extractQrCodeCandidates', () => {
  it('preserves raw legacy codes and letter case', () => {
    expect(extractQrCodeCandidates('  jMA8391758613990308  ')).toEqual([
      'jMA8391758613990308',
    ]);
  });

  it('accepts legacy QR image filenames', () => {
    expect(extractQrCodeCandidates('jMA8391758613990308.png')).toEqual([
      'jMA8391758613990308',
    ]);
  });

  it('extracts a code from supported JSON payloads without partial matching', () => {
    const payload = JSON.stringify({ id: 'jMA8391758613990308', points: 15 });
    expect(extractQrCodeCandidates(payload)).toEqual(['jMA8391758613990308']);
  });

  it('extracts a code from known URL query keys', () => {
    expect(
      extractQrCodeCandidates(
        'https://srvelectricals.com/verify?qr_code=jMA8391758613990308',
      ),
    ).toEqual(['jMA8391758613990308']);
  });

  it('extracts a code from legacy QR id query keys', () => {
    expect(
      extractQrCodeCandidates('https://srvelectricals.com/verify?qr_id=123456'),
    ).toEqual(['123456']);
  });

  it('extracts a code from a URL path and removes a png suffix', () => {
    expect(
      extractQrCodeCandidates(
        'https://srvelectricals.com/qrcodes/jMA8391758613990308.png',
      ),
    ).toEqual(['jMA8391758613990308']);
  });

  it('rejects empty and excessively large scanner payloads', () => {
    expect(extractQrCodeCandidates('   ')).toEqual([]);
    expect(extractQrCodeCandidates('x'.repeat(2049))).toEqual([]);
  });
});
