import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';

@Injectable()
export class MobileJwtStrategy extends PassportStrategy(Strategy, 'mobile-jwt') {
  constructor(
    private configService: ConfigService,
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterboyRepository: Repository<CounterBoy>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    let user: any;
    switch (payload.role) {
      case 'electrician':
        user = await this.electricianRepository.findOne({ where: { id: payload.sub } });
        break;
      case 'dealer':
        user = await this.dealerRepository.findOne({ where: { id: payload.sub } });
        break;
      case 'user':
        user = await this.appUserRepository.findOne({ where: { id: payload.sub } });
        break;
      case 'counterboy':
        user = await this.counterboyRepository.findOne({ where: { id: payload.sub } });
        break;
      default:
        throw new UnauthorizedException();
    }

    if (!user || user.status === 'suspended') {
      throw new UnauthorizedException();
    }

    return { id: user.id, phone: user.phone, role: payload.role };
  }
}
