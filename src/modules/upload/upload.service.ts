import { Injectable, BadRequestException } from '@nestjs/common';
/// <reference types="multer" />
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class UploadService {
  async uploadCourseImage(file: Express.Multer.File): Promise<string> {
    if (!file) throw new BadRequestException('لم يتم رفع ملف');
    
    // التحقق من النوع
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('نوع الملف غير مدعوم. مسموح: JPEG, PNG, WebP');
    }

    // التحقق من الحجم (5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('حجم الملف أكبر من 5MB');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'edusaas/courses',
          transformation: [
            { width: 1280, height: 720, crop: 'fill' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error) reject(new BadRequestException('فشل رفع الصورة'));
          else resolve(result.secure_url);
        }
      );

      // تحويل Buffer إلى Stream
      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}