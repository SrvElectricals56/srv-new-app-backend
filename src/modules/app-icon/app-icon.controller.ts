import {
  Controller, Get, Post, Patch, Body, Param, Delete, UseGuards,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AppIconService } from './app-icon.service';
import { CreateAppIconDto } from './dto/create-app-icon.dto';
import { UpdateAppIconDto } from './dto/update-app-icon.dto';
import { SetActiveIconDto } from './dto/set-active-icon.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums';
const ICON_UPLOAD_DIR = join(process.cwd(), 'uploads', 'icons');
if (!existsSync(ICON_UPLOAD_DIR)) {
  mkdirSync(ICON_UPLOAD_DIR, { recursive: true });
}

@ApiTags('App Icons')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('app-icons')
export class AppIconController {
  constructor(
    private readonly appIconService: AppIconService,
  ) {}

  @Post()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Create new app icon' })
  @ApiResponse({ status: 201, description: 'App icon created successfully' })
  create(@Body() createAppIconDto: CreateAppIconDto) {
    return this.appIconService.create(createAppIconDto);
  }

  @Post('upload-image')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Upload app icon image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: ICON_UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `icon-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed (jpeg, jpg, png, gif, webp)'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const iconUrl = `/uploads/icons/${file.filename}`;
    return {
      url: iconUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all app icons' })
  @ApiResponse({ status: 200, description: 'List of app icons' })
  findAll() {
    return this.appIconService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Get currently active app icon' })
  @ApiResponse({ status: 200, description: 'Active app icon' })
  findActive() {
    return this.appIconService.findActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get app icon by ID' })
  @ApiResponse({ status: 200, description: 'App icon details' })
  findOne(@Param('id') id: string) {
    return this.appIconService.findOne(id);
  }

  @Patch(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update app icon' })
  @ApiResponse({ status: 200, description: 'App icon updated successfully' })
  update(@Param('id') id: string, @Body() updateAppIconDto: UpdateAppIconDto) {
    return this.appIconService.update(id, updateAppIconDto);
  }

  @Patch(':id/set-active')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Set app icon as active' })
  @ApiResponse({ status: 200, description: 'App icon set as active successfully' })
  setActive(@Param('id') id: string) {
    return this.appIconService.setActive(id);
  }

  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete app icon' })
  @ApiResponse({ status: 200, description: 'App icon deleted successfully' })
  remove(@Param('id') id: string) {
    return this.appIconService.remove(id);
  }
}
