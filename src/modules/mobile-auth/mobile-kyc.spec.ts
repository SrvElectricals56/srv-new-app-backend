import { MobileAuthService } from './mobile-auth.service';

describe('KYC survives mobile profile updates', () => {
  function setup(status = 'verified') {
    const service: any = Object.create(MobileAuthService.prototype);
    const profile = { kycStatus: status, aadharFrontImage: '/uploads/a.jpg', panDocument: '/uploads/p.jpg' };
    service.getProfile = jest.fn().mockResolvedValue(profile);
    service.electricianRepository = { update: jest.fn() };
    return service;
  }

  it('keeps verified status and documents when an app resends the same documents', async () => {
    const service = setup();
    await service.updateProfile('id', 'electrician', { name: 'Updated', aadharFrontImage: '/uploads/a.jpg', panDocument: '/uploads/p.jpg', kycStatus: 'pending' });
    expect(service.electricianRepository.update).toHaveBeenCalledWith('id', { name: 'Updated', aadharFrontImage: '/uploads/a.jpg', panDocument: '/uploads/p.jpg' });
  });

  it.each(['/uploads/new.jpg', null])('requires review when approved evidence changes to %s', async aadharFrontImage => {
    const service = setup();
    await service.updateProfile('id', 'electrician', { aadharFrontImage });
    expect(service.electricianRepository.update).toHaveBeenCalledWith('id', { aadharFrontImage, kycStatus: 'pending', kycRejectionReason: null });
  });

  it('allows rejected documents to be resubmitted', async () => {
    const service = setup('rejected');
    await service.updateProfile('id', 'electrician', { aadharFrontImage: '/uploads/a.jpg' });
    expect(service.electricianRepository.update).toHaveBeenCalledWith('id', expect.objectContaining({ kycStatus: 'pending' }));
  });

  it('accepts a PAN-only first KYC submission for review', async () => {
    const service = setup('not_submitted');
    service.getProfile.mockResolvedValue({ kycStatus: 'not_submitted', aadharFrontImage: null, panDocument: null });

    await service.updateProfile('id', 'electrician', { panDocument: '/uploads/pan-only.jpg' });

    expect(service.electricianRepository.update).toHaveBeenCalledWith('id', {
      panDocument: '/uploads/pan-only.jpg',
      kycStatus: 'pending',
      kycRejectionReason: null,
    });
  });
});
