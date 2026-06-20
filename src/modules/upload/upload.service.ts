import { Injectable, BadRequestException } from '@nestjs/common';
/// <reference types="multer" />
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class UploadService {
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

  async uploadCourseImage(file: Express.Multer.File): Promise<string> {
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
    return result.secure_url;
  }

  async uploadCourseVideo(file: Express.Multer.File): Promise<{ url: string; hlsUrl: string; publicId: string }> {
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
    return { url: result.secure_url, hlsUrl, publicId: result.public_id };
  }

  // FEAT-06: Document Upload (PDF, DOCX, PPTX)
  async uploadDocument(file: Express.Multer.File): Promise<{ url: string; publicId: string; format: string; pages?: number }> {
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
    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: formatMap[file.mimetype] ?? 'unknown',
      pages: result.pages,
    };
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }

  async deleteVideo(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
  }

  async deleteDocument(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
  }
}