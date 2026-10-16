import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DealerService } from './dealer.service';
import { DealerController } from './dealer.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums';

describe('Sub dealer transfers', () => {
  let service: DealerService;
  let query: jest.Mock;
  let transaction: jest.Mock;
  const target = { id: 'target', name: 'Correct Dealer', phone: '9876543210', type: 'dealer' };
  beforeEach(() => {
    query = jest.fn();
    const manager = { query };
    transaction = jest.fn(callback => callback(manager));
    service = new DealerService({ manager: { ...manager, transaction } } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('normalizes a country prefix and prefers the registered dealer', async () => {
    query.mockResolvedValueOnce([target]);
    expect(await service.getTransferTarget('+91 9876543210')).toEqual(target);
    expect(query).toHaveBeenCalledWith(expect.any(String), ['9876543210']);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(['', '123', '123456789012345', 'wrong'])('rejects invalid phone %s', async phone => {
    await expect(service.getTransferTarget(phone)).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unknown and ambiguous destinations', async () => {
    query.mockResolvedValue([]);
    await expect(service.getTransferTarget(target.phone)).rejects.toThrow(NotFoundException);
    query.mockResolvedValue([target, { ...target, id: 'duplicate' }]);
    await expect(service.getTransferTarget(target.phone)).rejects.toThrow(ConflictException);
  });

  it('moves more than the 500 displayed accounts and clears old fallback associations', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([target])
      .mockResolvedValueOnce([{ phone: '9123456789' }])
      .mockResolvedValueOnce([Array.from({ length: 601 }, (_, id) => ({ id })), 601])
      .mockResolvedValue([]);
    const result = await service.transferSubDealer('source', target.phone, target.id);
    expect(result.movedElectricians).toBe(601);
    const [sql, params] = query.mock.calls[3];
    expect(sql).toContain('WHERE "dealerId" IS NULL');
    expect(sql).not.toMatch(/LIMIT|"walletBalance"|"totalPoints"|"totalScans"/);
    expect(params).toEqual(['9123456789', null, 'target', null, null]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenLastCalledWith('DELETE FROM "sub_dealers" WHERE "id"::text = $1', ['source']);
  });

  it('moves legacy code associations to an existing SRV sub dealer', async () => {
    const sub = { ...target, type: 'sub_dealer' };
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([sub])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{ code: 'OLD-CODE' }])
      .mockResolvedValueOnce([[{ id: 'electrician' }], 1]).mockResolvedValue([]);
    expect((await service.transferSubDealer('legacy-code-hash', target.phone, target.id)).movedElectricians).toBe(1);
    expect(query.mock.calls[5][1]).toEqual([null, 'OLD-CODE', null, target.name, target.phone]);
  });

  it('rejects a transfer to the same normalized number before updating', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([target])
      .mockResolvedValueOnce([{ phone: '+91 9876543210' }]);
    await expect(service.transferSubDealer('source', target.phone, target.id)).rejects.toThrow(BadRequestException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('rejects a changed destination and an empty source', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([target]);
    await expect(service.transferSubDealer('source', target.phone, 'old-target')).rejects.toThrow(ConflictException);
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([target])
      .mockResolvedValueOnce([{ phone: '9123456789' }]).mockResolvedValueOnce([[], 0]);
    await expect(service.transferSubDealer('source', target.phone, target.id)).rejects.toThrow(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
  });

  it('restricts lookup and transfer to super admins', () => {
    for (const method of ['getTransferTarget', 'transferSubDealer']) {
      expect(Reflect.getMetadata(ROLES_KEY, DealerController.prototype[method])).toEqual([AdminRole.SUPER_ADMIN]);
    }
  });
});
