import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const BANNER_DIR = join(UPLOAD_DIR, 'banners');
const PRODUCT_DIR = join(UPLOAD_DIR, 'products');
const CATALOG_DIR = join(UPLOAD_DIR, 'catalog');
const VIDEO_DIR = join(UPLOAD_DIR, 'videos');

// Ensure upload directories exist
[BANNER_DIR, PRODUCT_DIR, CATALOG_DIR, VIDEO_DIR].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

@ApiTags('Upload')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private configService: ConfigService) {}

  @Post('image')
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
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const port = this.configService.get<string>('PORT') || '3001';
    const host = this.configService.get<string>('SERVER_HOST') || '192.168.29.8';
    const imageUrl = `http://${host}:${port}/uploads/banners/${file.filename}`;

    return {
      url: imageUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    };
  }

  @Post('product-image')
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
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  uploadProductImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const port = this.configService.get<string>('PORT') || '3001';
    const host = this.configService.get<string>('SERVER_HOST') || '192.168.29.8';
    const imageUrl = `http://${host}:${port}/uploads/products/${file.filename}`;

    return {
      url: imageUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    };
  }

  @Post('catalog-pdf')
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
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  uploadCatalogPdf(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const port = this.configService.get<string>('PORT') || '3001';
    const host = this.configService.get<string>('SERVER_HOST') || '192.168.29.8';
    const url = `http://${host}:${port}/uploads/catalog/${file.filename}`;
    return { url, filename: file.filename, originalName: file.originalname, size: file.size };
  }

  @Post('video')
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
      limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    }),
  )
  uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const port = this.configService.get<string>('PORT') || '3001';
    const host = this.configService.get<string>('SERVER_HOST') || '192.168.29.8';
    const url = `http://${host}:${port}/uploads/videos/${file.filename}`;
    return { url, filename: file.filename, originalName: file.originalname, size: file.size };
  }
}
