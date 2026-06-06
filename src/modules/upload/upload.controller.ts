import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MobileJwtGuard } from '../mobile-auth/mobile-jwt.guard';
const UPLOAD_DIR = join(process.cwd(), 'uploads');
const BANNER_DIR = join(UPLOAD_DIR, 'banners');
const PRODUCT_DIR = join(UPLOAD_DIR, 'products');
const CATALOG_DIR = join(UPLOAD_DIR, 'catalog');
const VIDEO_DIR = join(UPLOAD_DIR, 'videos');
const AADHAR_DIR = join(UPLOAD_DIR, 'aadhar');

// Ensure upload directories exist
[BANNER_DIR, PRODUCT_DIR, CATALOG_DIR, VIDEO_DIR, AADHAR_DIR].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

@ApiTags('Upload')
@ApiBearerAuth('JWT-auth')
@Controller('upload')
export class UploadController {
  constructor(private configService: ConfigService) {}

  private getBaseUrl() {
    const appUrl = this.configService.get<string>('APP_URL');
    if (appUrl) return appUrl;
    const port = this.configService.get<string>('PORT') || '3001';
    const host = this.configService.get<string>('SERVER_HOST') || 'localhost';
    return `http://${host}:${port}`;
  }

  // Admin endpoints return relative paths so stored URLs don't depend on server IP
  private buildFileUrl(_req: Request, subPath: string): string {
    return `/uploads/${subPath}`;
  }

  // ── Admin-only endpoints (JwtAuthGuard — validates against admins table) ──

  @Post('image')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload banner image' })
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
        destination: BANNER_DIR,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `banner-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const imageUrl = this.buildFileUrl(req, `banners/${file.filename}`);
    return { url: imageUrl, filename: file.filename, originalName: file.originalname, size: file.size };
  }

  @Post('product-image')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload product image' })
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
        destination: PRODUCT_DIR,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `product-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadProductImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const imageUrl = this.buildFileUrl(req, `products/${file.filename}`);
    return { url: imageUrl, filename: file.filename, originalName: file.originalname, size: file.size };
  }

  @Post('catalog-pdf')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload product catalog PDF' })
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
        destination: CATALOG_DIR,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `catalog-${uniqueSuffix}.pdf`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('Only PDF files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  uploadCatalogPdf(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = this.buildFileUrl(req, `catalog/${file.filename}`);
    return { url, filename: file.filename, originalName: file.originalname, size: file.size };
  }

  @Post('video')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload play video file' })
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
        destination: VIDEO_DIR,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `video-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^video\/(mp4|webm|ogg|quicktime|x-msvideo|x-matroska)$/)) {
          return cb(new BadRequestException('Only video files are allowed (mp4, webm, mov, avi, mkv)'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  uploadVideo(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = this.buildFileUrl(req, `videos/${file.filename}`);
    return { url, filename: file.filename, originalName: file.originalname, size: file.size };
  }

  // ── Mobile-only endpoint (MobileJwtGuard — validates against mobile users) ──

  @Post('aadhar-image')
  @UseGuards(MobileJwtGuard)
  @ApiOperation({ summary: 'Upload Aadhar front or back image (mobile users)' })
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
        destination: AADHAR_DIR,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `aadhar-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^(image\/(jpeg|jpg|png|gif|webp)|application\/pdf)$/)) {
          return cb(new BadRequestException('Only image files or PDF are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadAadharImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const imageUrl = `${this.getBaseUrl()}/uploads/aadhar/${file.filename}`;
    return { url: imageUrl, filename: file.filename, originalName: file.originalname, size: file.size };
  }
}
