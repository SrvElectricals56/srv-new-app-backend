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

  it('generates full 20-character QR identifiers without zero padding', async () => {
    const qrRows: { id: string; code: string }[] = [];
    const query = jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes('MAX("batchNo")')) return [{ maxBatchNo: 36 }];
      if (sql.includes('INSERT INTO "qr_codes"')) {
        const code = String(params?.[0]);
        qrRows.push({ id: 'qr-1', code });
        return qrRows;
      }
      if (sql.includes('INSERT INTO "qr_code_batches"')) return [];
      throw new Error(`Unexpected QR query: ${sql}`);
    });
    const productRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST-1',
        points: 25,
        isActive: true,
      }),
    };
    const service = new QrCodeService(
      { query } as any,
      {} as any,
      productRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.generate({ productId: 'product-1', quantity: 1 });
    const code = result.codes[0].code;

    expect(code).toMatch(/^[A-F0-9]{20}$/);
    expect(code).not.toMatch(/0{5}$/);
    expect(result.points).toBe(25);
    expect(result.total).toBe(1);
  });
});
