import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupportTicketStatus, SupportTicketPriority } from '../../common/enums';

@ApiTags('Support Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  @ApiOperation({ summary: 'Get all support tickets' })
  @ApiResponse({ status: 200, description: 'List of support tickets' })
  getTickets(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: SupportTicketStatus,
    @Query('priority') priority?: SupportTicketPriority,
  ) {
    return this.supportService.getTickets(parseInt(page), parseInt(limit), status, priority);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get support ticket by ID' })
  @ApiResponse({ status: 200, description: 'Support ticket details' })
  getTicket(@Param('id') id: string) {
    return this.supportService.getTicket(id);
  }

  @Patch('tickets/:id/respond')
  @ApiOperation({ summary: 'Respond to support ticket' })
  @ApiResponse({ status: 200, description: 'Response added successfully' })
  respond(
    @Param('id') id: string,
    @Body() body: { message: string; response?: string },
    @CurrentUser('id') adminId: string,
  ) {
    const message = body.message || body.response;
    return this.supportService.respond(id, message, adminId);
  }

  @Patch('tickets/:id/status')
  @ApiOperation({ summary: 'Update ticket status' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: SupportTicketStatus,
    @CurrentUser('id') adminId: string,
  ) {
    return this.supportService.updateStatus(id, status, adminId);
  }
}