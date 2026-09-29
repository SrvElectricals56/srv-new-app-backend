import { QrCodeService } from './qr-code.service';

describe('QR Hub creator attribution', () => {
  it('returns the creator name with batches and keeps missing creators visible', async () => {
    const rows = [{ batchId: '1', generatedBy: 'QR Staff' }, { batchId: '2', generatedBy: 'Not recorded' }];
    const query = jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([{ total: 2 }]);
    const service = new QrCodeService({ query } as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any);
    const result = await service.findBatches(1, 20, 'Product');
    expect(result.data).toEqual(rows);
    expect(query.mock.calls[0][0]).toContain('LEFT JOIN "admins"');
    expect(query.mock.calls[0][0]).toContain('b."createdBy"::text');
    expect(query.mock.calls[0][0]).toContain("'Not recorded'");
    expect(query.mock.calls[0][1]).toEqual(['%Product%', 20, 0]);
    expect(result.total).toBe(2);
  });
});
