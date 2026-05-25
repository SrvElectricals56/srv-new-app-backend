import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PlayService } from './play.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums';
import { MobileJwtGuard } from '../mobile-auth/mobile-jwt.guard';

// ── Admin routes (/plays) ──────────────────────────────────────────────────

@ApiTags('Plays Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plays')
export class PlayController {
  constructor(private readonly playService: PlayService) {}

  @Get()
  @ApiOperation({ summary: 'Get all plays (admin)' })
  findAll(@Query('all') all?: string) {
    return this.playService.findAll(all === 'true');
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get play stats' })
  getStats() {
    return this.playService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get play by ID' })
  findOne(@Param('id') id: string) {
    return this.playService.findOne(id);
  }

  @Get(':id/viewers')
  @ApiOperation({ summary: 'Get viewers for a play' })
  getViewers(@Param('id') id: string) {
    return this.playService.getViewers(id);
  }

  @Get(':id/interactions')
  @ApiOperation({ summary: 'Get likes, comments, and replies for a play' })
  getInteractions(@Param('id') id: string) {
    return this.playService.getInteractions(id);
  }

  @Post()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Create a new play' })
  create(@Body() body: any) {
    return this.playService.create(body);
  }

  @Patch(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update a play' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.playService.update(id, body);
  }

  @Post(':id/comments/:commentId/replies')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Reply to a play comment from admin panel' })
  replyToComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Request() req: any,
    @Body() body: { message: string },
  ) {
    return this.playService.replyToComment(
      id,
      commentId,
      { id: req.user.id, role: req.user.role, name: req.user.name },
      body.message,
    );
  }

  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Delete a play' })
  remove(@Param('id') id: string) {
    return this.playService.remove(id);
  }
}

// ── Mobile routes (/mobile/plays) ─────────────────────────────────────────

@ApiTags('Mobile App')
@UseGuards(MobileJwtGuard)
@ApiBearerAuth('JWT-auth')
@Controller('mobile/plays')
export class MobilePlayController {
  constructor(private readonly playService: PlayService) {}

  @Get()
  @ApiOperation({ summary: 'Get active plays for app' })
  getActivePlays(@Request() req: any) {
    return this.playService.getActivePlays(req.user.role);
  }

  @Post(':id/view')
  @ApiOperation({ summary: 'Record a play view' })
  recordView(@Param('id') id: string, @Request() req: any) {
    return this.playService.recordView(id, req.user.id, req.user.role);
  }

  @Get(':id/interactions')
  @ApiOperation({ summary: 'Get likes, comments, and replies for a play' })
  getMobileInteractions(@Param('id') id: string, @Request() req: any) {
    return this.playService.getInteractions(id, req.user.id, req.user.role);
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Toggle like for a play' })
  toggleLike(@Param('id') id: string, @Request() req: any) {
    return this.playService.toggleLike(id, req.user.id, req.user.role, req.user.name);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment on a play' })
  addComment(@Param('id') id: string, @Request() req: any, @Body() body: { message: string }) {
    return this.playService.addComment(
      id,
      { id: req.user.id, role: req.user.role, name: req.user.name },
      body.message,
    );
  }
}
