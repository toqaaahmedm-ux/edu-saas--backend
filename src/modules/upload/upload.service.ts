import { Injectable, BadRequestException } from '@nestjs/common';
/// <reference types="multer" />
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaAssetType } from '@prisma/client';

@Injectable()
export class UploadService {
  constructor(private readonly prisma: PrismaService) {}

  private streamUpload(file: Express.Multer.File, options: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) reject(new BadRequestException('فشل رفع الملف'));
          else resolve(result);
        }
      );
      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  // Storage usage tracking fix: records every successful upload as a
  // MediaAsset row so per-tenant storage consumption can actually be
  // calculated instead of always returning 0.
  private async trackAsset(params: {
    tenantId: string;
    uploaderId: string;
    type: MediaAssetType;
    url: string;
    publicId: string;
    sizeBytes: number;
  }) {
    await this.prisma.mediaAsset.create({ data: params });
  }

  async uploadCourseImage(
    file: Express.Multer.File,
    tenantId: string,
    uploaderId: string,
  ): Promise<string> {
    if (!file) throw new BadRequestException('لم يتم رفع ملف');
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('نوع الملف غير مدعوم. مسموح: JPEG, PNG, WebP');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('حجم الملف أكبر من 5MB');
    }
    const result = await this.streamUpload(file, {
      folder: 'edusaas/courses/images',
      transformation: [
        { width: 1280, height: 720, crop: 'fill' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    await this.trackAsset({
      tenantId,
      uploaderId,
      type: MediaAssetType.IMAGE,
      url: result.secure_url,
      publicId: result.public_id,
      sizeBytes: file.size,
    });

    return result.secure_url;
  }

  async uploadCourseVideo(
    file: Express.Multer.File,
    tenantId: string,
    uploaderId: string,
  ): Promise<{ url: string; hlsUrl: string; publicId: string }> {
    if (!file) throw new BadRequestException('لم يتم رفع ملف');
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('نوع الملف غير مدعوم. مسموح: MP4, WebM, MOV');
    }
    if (file.size > 500 * 1024 * 1024) {
      throw new BadRequestException('حجم الفيديو أكبر من 500MB');
    }
    const result = await this.streamUpload(file, {
      folder: 'edusaas/courses/videos',
      resource_type: 'video',
      chunk_size: 6000000,
      eager: [{ streaming_profile: 'hd', format: 'm3u8' }],
      eager_async: true,
    });
    const hlsUrl = result.eager?.[0]?.secure_url
      ?? result.secure_url.replace('/upload/', '/upload/sp_hd/').replace(/\.[^.]+$/, '.m3u8');

    await this.trackAsset({
      tenantId,
      uploaderId,
      type: MediaAssetType.VIDEO,
      url: result.secure_url,
      publicId: result.public_id,
      sizeBytes: file.size,
    });

    return { url: result.secure_url, hlsUrl, publicId: result.public_id };
  }

  // FEAT-06: Document Upload (PDF, DOCX, PPTX)
  async uploadDocument(
    file: Express.Multer.File,
    tenantId: string,
    uploaderId: string,
  ): Promise<{ url: string; publicId: string; format: string; pages?: number }> {
    if (!file) throw new BadRequestException('لم يتم رفع ملف');
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('نوع الملف غير مدعوم. مسموح: PDF, DOCX, PPTX');
    }
    if (file.size > 50 * 1024 * 1024) {
      throw new BadRequestException('حجم الملف أكبر من 50MB');
    }
    const result = await this.streamUpload(file, {
      folder: 'edusaas/courses/documents',
      resource_type: 'raw',
      use_filename: true,
      unique_filename: true,
    });
    const formatMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    };

    await this.trackAsset({
      tenantId,
      uploaderId,
      type: MediaAssetType.DOCUMENT,
      url: result.secure_url,
      publicId: result.public_id,
      sizeBytes: file.size,
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: formatMap[file.mimetype] ?? 'unknown',
      pages: result.pages,
    };
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
    await this.prisma.mediaAsset.deleteMany({ where: { publicId } });
  }

  async deleteVideo(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    await this.prisma.mediaAsset.deleteMany({ where: { publicId } });
  }

  async deleteDocument(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    await this.prisma.mediaAsset.deleteMany({ where: { publicId } });
  }

  // Storage usage tracking fix: real per-tenant total, replacing the
  // hardcoded 0 placeholder that used to live in admin.service.ts.
  async getTenantStorageUsage(tenantId: string): Promise<number> {
    const result = await this.prisma.mediaAsset.aggregate({
      where: { tenantId },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes ?? 0;
  }
}