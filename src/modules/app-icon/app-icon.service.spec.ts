import { BadRequestException } from '@nestjs/common';
import { AppIconService } from './app-icon.service';

describe('AppIconService launcher icon safety', () => {
  const repository = {
    findOne: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  let service: AppIconService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppIconService(repository as any);
  });

  it('activates a launcher icon only when its native key is bundled', async () => {
    repository.findOne
      .mockResolvedValueOnce({ id: 'diwali-id', nativeKey: 'diwali', isActive: false })
      .mockResolvedValueOnce({ id: 'diwali-id', nativeKey: 'diwali', isActive: true });
    repository.update.mockResolvedValue({ affected: 1 });

    await expect(service.setActive('diwali-id')).resolves.toMatchObject({ nativeKey: 'diwali' });
    expect(repository.update).toHaveBeenCalledWith({ isActive: true }, { isActive: false });
    expect(repository.update).toHaveBeenCalledWith('diwali-id', { isActive: true });
  });

  it('rejects an uploaded preview that is not bundled in the native app', async () => {
    repository.findOne.mockResolvedValue({ id: 'legacy-id', nativeKey: null, isActive: false });

    await expect(service.setActive('legacy-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('returns the primary icon when no active database row exists', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findActive()).resolves.toMatchObject({
      nativeKey: 'default',
      isActive: true,
    });
  });
});
