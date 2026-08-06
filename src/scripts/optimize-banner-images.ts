import 'reflect-metadata';
import { access, stat, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
const sharp: any = require('sharp');
import AppDataSource from '../database/data-source';
import { Banner } from '../database/entities/banner.entity';

const BANNER_PATH_MARKER = '/uploads/banners/';
const bannerDirectory = join(process.cwd(), 'uploads', 'banners');

function localFilename(imageUrl: string) {
  const markerIndex = imageUrl.indexOf(BANNER_PATH_MARKER);
  if (markerIndex < 0) return null;
  const value = imageUrl.slice(markerIndex + BANNER_PATH_MARKER.length).split(/[?#]/, 1)[0];
  const decoded = decodeURIComponent(value);
  return decoded && !decoded.includes('/') && !decoded.includes('\\') ? decoded : null;
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await AppDataSource.initialize();
  const repository = AppDataSource.getRepository(Banner);
  const banners = await repository.find();
  let updated = 0;

  for (const banner of banners) {
    const sourceFilename = localFilename(banner.imageUrl ?? '');
    if (!sourceFilename || sourceFilename.endsWith('-optimized.webp')) continue;

    const sourcePath = join(bannerDirectory, sourceFilename);
    if (!(await fileExists(sourcePath))) continue;

    const baseName = sourceFilename.slice(0, -extname(sourceFilename).length);
    const outputFilename = `${baseName}-optimized.webp`;
    const outputPath = join(bannerDirectory, outputFilename);
    const sourceStat = await stat(sourcePath);

    if (!(await fileExists(outputPath))) {
      await sharp(sourcePath, { animated: true })
        .rotate()
        .resize({ width: 1200, height: 800, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4, smartSubsample: true })
        .toFile(outputPath);
    }

    const outputStat = await stat(outputPath);
    if (outputStat.size >= sourceStat.size) {
      await unlink(outputPath).catch(() => undefined);
      continue;
    }

    const optimizedUrl = banner.imageUrl.replace(sourceFilename, outputFilename);
    await repository.update(banner.id, { imageUrl: optimizedUrl });
    updated += 1;
    console.log(`${sourceFilename}: ${sourceStat.size} -> ${outputStat.size} bytes`);
  }

  console.log(`Optimized ${updated} banner record(s).`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });
