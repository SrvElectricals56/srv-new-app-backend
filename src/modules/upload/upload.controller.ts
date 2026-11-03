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
import { basename, extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { stat, unlink, open, rename, readFile, writeFile } from 'fs/promises';
import { Request } from 'express';
const sharp: any = require('sharp');
const convertHeic: any = require('heic-convert');
const decodeBmp: any = require('bmp-js');
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MobileJwtGuard } from '../mobile-auth/mobile-jwt.guard';
const UPLOAD_DIR = join(process.cwd(), 'uploads');
const BANNER_DIR = join(UPLOAD_DIR, 'banners');
const PRODUCT_DIR = join(UPLOAD_DIR, 'products');
const CATALOG_DIR = join(UPLOAD_DIR, 'catalog');
const VIDEO_DIR = join(UPLOAD_DIR, 'videos');
const PLAY_THUMBNAIL_DIR = join(UPLOAD_DIR, 'play-thumbnails');
const AADHAR_DIR = join(UPLOAD_DIR, 'aadhar');
const KYC_MAX_FILE_SIZE = 25 * 1024 * 1024;
const KYC_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'tiff', 'bmp', 'heif']);

// Ensure upload directories exist
[BANNER_DIR, PRODUCT_DIR, CATALOG_DIR, VIDEO_DIR, PLAY_THUMBNAIL_DIR, AADHAR_DIR].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

@ApiTags('Upload')
@ApiBearerAuth('JWT-auth')
@Controller('upload')
export class UploadController {
  private async optimizeImage(
    file: Express.Multer.File,
    maxWidth: number,
    maxHeight: number,
    limitInputPixels?: number,
  ) {
    const baseName = file.filename.slice(0, file.filename.length - extname(file.filename).length);
    const optimizedFilename = `${baseName}-optimized.webp`;
    const optimizedPath = join(file.destination, optimizedFilename);

    try {
      await sharp(file.path, { animated: true, limitInputPixels })
        .rotate()
        .resize({
          width: maxWidth,
          height: maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 4, smartSubsample: true })
        .toFile(optimizedPath);
      const optimizedStat = await stat(optimizedPath);
      await unlink(file.path);
      return {
        filename: optimizedFilename,
        size: optimizedStat.size,
      };
    } catch {
      // Keep the original upload if the optimizer cannot read an unusual but
      // otherwise valid image. Uploading must remain reliable for admins.
      return { filename: file.filename, size: file.size };
    }
  }

  private async prepareKycDocument(file: Express.Multer.File) {
    const handle = await open(file.path, 'r');
    const header = Buffer.alloc(5);
    try { await handle.read(header, 0, 5, 0); } finally { await handle.close(); }
    if (header.toString() === '%PDF-') {
      const filename = `${basename(file.filename, extname(file.filename))}.pdf`;
      if (filename !== file.filename) await rename(file.path, join(file.destination, filename));
      return { filename, size: file.size };
    }
    const looksLikeHeic = /\.(heic|heif)$/i.test(file.originalname || file.filename) ||
      /^(image\/heic|image\/heif)$/i.test(file.mimetype || '');
    const looksLikeBmp = /\.bmp$/i.test(file.originalname || file.filename) ||
      /^image\/bmp$/i.test(file.mimetype || '');
    let format: string | undefined;
    try {
      format = (await sharp(file.path, { limitInputPixels: 60_000_000 }).metadata()).format;
    } catch {
      // The file is neither a PDF nor an image that this server can decode.
    }
    if (looksLikeHeic || looksLikeBmp) {
      // libvips builds used by Sharp do not consistently include HEIC support.
      // Decode these iPhone documents explicitly, then run the same safe
      // resize/normalisation path as every other raster image.
      try {
        const source = await readFile(file.path);
        const bmp = looksLikeBmp ? decodeBmp.decode(source) : undefined;
        const jpeg = looksLikeBmp
          ? await sharp(bmp.data, {
            raw: {
              width: bmp.width,
              height: bmp.height,
              channels: 4,
            },
          }).jpeg({ quality: 90 }).toBuffer()
          : await convertHeic({ buffer: source, format: 'JPEG', quality: 0.9 });
        const convertedFilename = basename(file.filename, extname(file.filename)) + '-source.jpg';
        const convertedPath = join(file.destination, convertedFilename);
        await writeFile(convertedPath, jpeg);
        await unlink(file.path).catch(() => undefined);
        file = {
          ...file,
          filename: convertedFilename,
          originalname: convertedFilename,
          mimetype: 'image/jpeg',
          path: convertedPath,
          size: jpeg.length,
        };
        format = 'jpeg';
      } catch {
        format = undefined;
      }
    }
    if (!format || !KYC_IMAGE_FORMATS.has(format)) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('Choose a valid photo or PDF document.');
    }
    const result = await this.optimizeImage(file, 2400, 2400, 60_000_000);
    if (result.filename === file.filename) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('Unable to read this photo. Please choose another photo or PDF.');
    }
    return result;
  }

  // Store relative paths so documents work on phones and after server changes.
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
  async uploadImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const optimized = await this.optimizeImage(file, 1200, 800);
    const imageUrl = this.buildFileUrl(req, `banners/${optimized.filename}`);
    return { url: imageUrl, filename: optimized.filename, originalName: file.originalname, size: optimized.size };
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
  async uploadProductImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const optimized = await this.optimizeImage(file, 1200, 1200);
    const imageUrl = this.buildFileUrl(req, `products/${optimized.filename}`);
    return { url: imageUrl, filename: optimized.filename, originalName: file.originalname, size: optimized.size };
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

  @Post('play-thumbnail')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload play video thumbnail image' })
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
        destination: PLAY_THUMBNAIL_DIR,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `play-thumbnail-${uniqueSuffix}${extname(file.originalname)}`);
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
  uploadPlayThumbnail(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = this.buildFileUrl(req, `play-thumbnails/${file.filename}`);
    return { url, filename: file.filename, originalName: file.originalname, size: file.size };
  }

  @Post('kyc-document')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: AADHAR_DIR,
      filename: (_req, file, cb) => cb(null, `kyc-${crypto.randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: KYC_MAX_FILE_SIZE },
  }))
  async uploadKycDocument(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const result = await this.prepareKycDocument(file);
    return { url: this.buildFileUrl(req, `aadhar/${result.filename}`), filename: result.filename };
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
      limits: { fileSize: KYC_MAX_FILE_SIZE },
    }),
  )
  async uploadAadharImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const result = await this.prepareKycDocument(file);
    const imageUrl = this.buildFileUrl(req, `aadhar/${result.filename}`);
    return { url: imageUrl, filename: result.filename, originalName: file.originalname, size: result.size };
  }
}
