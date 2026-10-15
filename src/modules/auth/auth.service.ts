import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Admin } from '../../database/entities/admin.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private hashRefreshToken(refreshToken: string): string {
    return createHmac(
      'sha256',
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    )
      .update(refreshToken)
      .digest('hex');
  }

  private refreshTokenMatches(refreshToken: string, storedHash: string): boolean {
    const suppliedHash = Buffer.from(this.hashRefreshToken(refreshToken), 'hex');
    const expectedHash = Buffer.from(storedHash, 'hex');
    return (
      suppliedHash.length === expectedHash.length &&
      timingSafeEqual(suppliedHash, expectedHash)
    );
  }

  async validateUser(identifier: string, password: string): Promise<any> {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const admin = await this.adminRepository
      .createQueryBuilder('admin')
      .where('LOWER(admin.email) = :identifier', { identifier: normalizedIdentifier })
      .orWhere('LOWER(admin.name) = :identifier', { identifier: normalizedIdentifier })
      .getOne();

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await admin.validatePassword(password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password: _, ...result } = admin;
    return result;
  }

  async login(loginDto: LoginDto) {
    const identifier = loginDto.identifier?.trim() || loginDto.email?.trim();
    if (!identifier) {
      throw new BadRequestException('Username or email is required');
    }

    const admin = await this.validateUser(identifier, loginDto.password);

    const payload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      tokenVersion: admin.tokenVersion ?? 0,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    // Store only a keyed digest. A database read cannot be used to replay the
    // bearer token, and the server can still revoke/rotate the session.
    await this.adminRepository.update(admin.id, {
      lastLoginAt: new Date(),
      refreshToken: this.hashRefreshToken(refreshToken),
    });

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        email: admin.email ?? null,
        name: admin.name,
        role: admin.role,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const admin = await this.adminRepository.findOne({
        where: { id: payload.sub },
      });

      if (
        !admin ||
        !admin.isActive ||
        (admin.tokenVersion ?? 0) !== (payload.tokenVersion ?? 0) ||
        !admin.refreshToken ||
        !this.refreshTokenMatches(refreshToken, admin.refreshToken)
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload = {
        sub: admin.id,
        email: admin.email,
        role: admin.role,
        tokenVersion: admin.tokenVersion ?? 0,
      };

      const accessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn:
          this.configService.get('JWT_REFRESH_EXPIRES_IN') || '30d',
      });

      await this.adminRepository.update(admin.id, {
        refreshToken: this.hashRefreshToken(newRefreshToken),
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.adminRepository
      .createQueryBuilder()
      .update(Admin)
      .set({
        refreshToken: null,
        tokenVersion: () => '"tokenVersion" + 1',
      })
      .where('id = :userId', { userId })
      .execute();
    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string) {
    const admin = await this.adminRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'name', 'role', 'phone', 'isActive', 'lastLoginAt', 'createdAt'],
    });

    if (!admin) {
      throw new BadRequestException('Admin not found');
    }

    return admin;
  }

}
