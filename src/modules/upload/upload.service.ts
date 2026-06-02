import { Injectable, BadRequestException } from '@nestjs/common';
/// <reference types="multer" />
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class UploadService {
  private streamUpload(file: Express.Multer.File, options: object): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) reject(new BadRequestException('فشل رفع الملف'));
          else resolve(result.secure_url);
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

    return this.streamUpload(file, {
      folder: 'edusaas/courses/images',
      transformation: [
        { width: 1280, height: 720, crop: 'fill' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });
  }

  async uploadCourseVideo(file: Express.Multer.File): Promise<string> {
    if (!file) throw new BadRequestException('لم يتم رفع ملف');

    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('نوع الملف غير مدعوم. مسموح: MP4, WebM, MOV');
    }

    if (file.size > 500 * 1024 * 1024) {
      throw new BadRequestException('حجم الفيديو أكبر من 500MB');
    }

    return this.streamUpload(file, {
      folder: 'edusaas/courses/videos',
      resource_type: 'video',
      chunk_size: 6000000,
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }

  async deleteVideo(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
  }
}