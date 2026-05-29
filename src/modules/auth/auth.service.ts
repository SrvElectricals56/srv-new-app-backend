import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Admin } from '../../database/entities/admin.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private authSchemaEnsured = false;

  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureAuthSessionColumns();
  }

  async validateUser(email: string, password: string): Promise<any> {
    await this.ensureAuthSessionColumns();

    const admin = await this.adminRepository.findOne({ where: { email } });

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
    const admin = await this.validateUser(loginDto.email, loginDto.password);

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

    // Update last login and refresh token
    await this.adminRepository.update(admin.id, {
      lastLoginAt: new Date(),
      refreshToken,
    });

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    await this.ensureAuthSessionColumns();

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const admin = await this.adminRepository.findOne({
        where: { id: payload.sub, refreshToken },
      });

      if (!admin) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload = {
        sub: admin.id,
        email: admin.email,
        role: admin.role,
        tokenVersion: admin.tokenVersion ?? 0,
      };

      const accessToken = this.jwtService.sign(newPayload);

      return {
        accessToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.ensureAuthSessionColumns();

    await this.adminRepository.update(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string) {
    await this.ensureAuthSessionColumns();

    const admin = await this.adminRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'name', 'role', 'phone', 'isActive', 'lastLoginAt', 'createdAt'],
    });

    if (!admin) {
      throw new BadRequestException('Admin not found');
    }

    return admin;
  }

  private async ensureAuthSessionColumns() {
    if (this.authSchemaEnsured) {
      return;
    }

    try {
      await this.adminRepository.query(`
        ALTER TABLE "admins"
        ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0
      `);
      await this.adminRepository.query(`
        UPDATE "admins"
        SET "tokenVersion" = COALESCE("tokenVersion", 0)
      `);
      this.authSchemaEnsured = true;
    } catch (error) {
      this.logger.error(
        'Unable to ensure admin auth session columns exist',
        error as Error,
      );
      throw error;
    }
  }
}
