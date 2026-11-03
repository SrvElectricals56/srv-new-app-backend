import 'reflect-metadata';
import { AppIconController } from './app-icon.controller';

describe('AppIconController', () => {
  it('keeps the active launcher icon endpoint public for signed-out app startup', () => {
    const isPublic = Reflect.getMetadata(
      'isPublic',
      AppIconController.prototype.findActive,
    );

    expect(isPublic).toBe(true);
  });
});
