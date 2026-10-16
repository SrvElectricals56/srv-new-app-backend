import { ElectricianService } from './electrician.service';
import { KYCStatus } from '../../common/enums';

describe('Admin KYC status corrections', () => {
  it.each([KYCStatus.PENDING, KYCStatus.VERIFIED, KYCStatus.REJECTED])('saves %s instead of deriving it from the image', async kycStatus => {
    const service: any = Object.create(ElectricianService.prototype);
    service.findOne = jest.fn().mockResolvedValue({ id: 'test', kycStatus: KYCStatus.VERIFIED, aadharFrontImage: '/uploads/a.jpg' });
    service.hashPassword = jest.fn();
    service.electricianRepository = { update: jest.fn() };
    service.normalizeIndependentPointFields = jest.fn();
    await service.update('test', { kycStatus, kycRejectionReason: 'Review again' });
    expect(service.electricianRepository.update).toHaveBeenCalledWith('test', expect.objectContaining({ kycStatus }));
  });
  it('does not silently change review status when editing a name', async () => {
    const service: any = Object.create(ElectricianService.prototype);
    service.findOne = jest.fn().mockResolvedValue({ id: 'test', kycStatus: KYCStatus.PENDING, aadharFrontImage: '/uploads/a.jpg' });
    service.hashPassword = jest.fn(); service.normalizeIndependentPointFields = jest.fn();
    service.electricianRepository = { update: jest.fn() };
    await service.update('test', { name: 'Corrected name' });
    expect(service.electricianRepository.update).toHaveBeenCalledWith('test', { name: 'Corrected name' });
  });
});
