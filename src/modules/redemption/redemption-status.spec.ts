import { RedemptionService } from './redemption.service';
import { RedemptionStatus, UserRole } from '../../common/enums';

describe('Redemption status correction', () => {
  function setup(status: RedemptionStatus) {
    const service: any = Object.create(RedemptionService.prototype);
    const row = { id: 'request', status, role: UserRole.ELECTRICIAN };
    const query: any = {};
    for (const name of ['setLock', 'where']) query[name] = jest.fn(() => query);
    query.getOne = jest.fn().mockResolvedValue(row);
    const repository = { createQueryBuilder: () => query, update: jest.fn() };
    service.dataSource = { transaction: async (fn: any) => fn({ getRepository: () => repository }) };
    service.syncWalletForStatusChange = jest.fn();
    service.creditDealerCommission = jest.fn();
    service.findOne = jest.fn().mockResolvedValue(row);
    service.sendRedemptionNotification = jest.fn();
    return { service, repository };
  }
  it('does not double-process a repeated approval', async () => {
    const { service, repository } = setup(RedemptionStatus.APPROVED);
    await service.updateStatus('request', RedemptionStatus.APPROVED, 'admin');
    expect(repository.update).not.toHaveBeenCalled();
    expect(service.syncWalletForStatusChange).not.toHaveBeenCalled();
    expect(service.creditDealerCommission).not.toHaveBeenCalled();
    expect(service.sendRedemptionNotification).not.toHaveBeenCalled();
  });
  it.each([RedemptionStatus.PENDING, RedemptionStatus.REJECTED])('allows approved to %s', async next => {
    const { service, repository } = setup(RedemptionStatus.APPROVED);
    await service.updateStatus('request', next, 'admin', 'Correction');
    expect(service.syncWalletForStatusChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }), next, 'Correction', expect.anything());
    expect(repository.update).toHaveBeenCalledWith('request', expect.objectContaining({ status: next }));
  });
});
