import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CounterBoyService } from './counterboy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole, UserStatus } from '../../common/enums';

@ApiTags('Counter Boys')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('counterboys')
export class CounterBoyController {
  constructor(private readonly counterboyService: CounterBoyService) {}

  @Post()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Create counter boy' })
  create(@Body() body: any) {
    return this.counterboyService.create(body);
  }

  @Post('import')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Bulk import counter boys (upsert by phone)' })
  importMany(@Body('records') records: any[]) {
    return this.counterboyService.importMany(records);
  }

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get all counter boys' })
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.counterboyService.findAll(+page, +limit, search, status);
  }

  @Get('stats')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get counter boy stats' })
  getStats() {
    return this.counterboyService.getStats();
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get single counter boy' })
  findOne(@Param('id') id: string) {
    return this.counterboyService.findOne(id);
  }

  @Patch(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update counter boy' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.counterboyService.update(id, body);
  }

  @Patch(':id/status')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update counter boy status' })
  updateStatus(@Param('id') id: string, @Body('status') status: UserStatus) {
    return this.counterboyService.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete counter boy (Super Admin only)' })
  remove(@Param('id') id: string) {
    return this.counterboyService.remove(id);
  }
}
