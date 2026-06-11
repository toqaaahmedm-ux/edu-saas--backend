import {
  Controller, Post, UseGuards,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiConsumes, ApiBody, ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UploadService } from './upload.service';

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
@UseGuards(SessionAuthGuard, RolesGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) { }

  @Post('course-image')
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  async uploadCourseImage(@UploadedFile() file: Express.Multer.File) {
    const url = await this.uploadService.uploadCourseImage(file);
    // INT-02: شلنا الـ manual wrap — TransformInterceptor هيلفه تلقائياً
    // النتيجة: { success: true, data: { url } } ✅
    return { url };
  }

  @Post('course-video')
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('video', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { video: { type: 'string', format: 'binary' } },
    },
  })
  async uploadCourseVideo(@UploadedFile() file: Express.Multer.File) {
    const url = await this.uploadService.uploadCourseVideo(file);
    // INT-02: شلنا الـ manual wrap
    return { url };
  }
}