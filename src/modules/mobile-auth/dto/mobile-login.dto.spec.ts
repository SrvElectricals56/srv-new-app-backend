import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  MobileLoginDto,
  PasswordLoginDto,
  RegisterDealerDto,
  VerifyOtpDto,
} from './mobile-login.dto';

describe('mobile auth DTO validation', () => {
  it('accepts a valid mobile login request', async () => {
    const dto = plainToInstance(MobileLoginDto, {
      phone: '9876543210',
      role: 'electrician',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects non-numeric and incorrectly sized phone numbers', async () => {
    const dto = plainToInstance(MobileLoginDto, {
      phone: 'abcdefghij',
      role: 'electrician',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'phone')).toBe(true);
  });

  it('rejects malformed OTP and password login requests', async () => {
    const otpDto = plainToInstance(VerifyOtpDto, {
      phone: '9876543210',
      role: 'dealer',
      otp: '1',
    });
    const passwordDto = plainToInstance(PasswordLoginDto, {
      phone: '9876543210',
      role: 'dealer',
      password: '',
    });

    expect((await validate(otpDto)).some((error) => error.property === 'otp')).toBe(true);
    expect(
      (await validate(passwordDto)).some((error) => error.property === 'password'),
    ).toBe(true);
  });

  it('accepts the supported dealer registration shape', async () => {
    const dto = plainToInstance(RegisterDealerDto, {
      name: 'Test Dealer',
      phone: '9876543210',
      email: 'dealer@example.com',
      town: 'Delhi',
      district: 'New Delhi',
      state: 'Delhi',
      address: 'Test address',
      pincode: '110001',
      gstNumber: '07ABCDE1234F1Z5',
      password: 'StrongPassword123',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
