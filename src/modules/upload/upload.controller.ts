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
  constructor(private readonly uploadService: UploadService) {}

  @Post('course-image')
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } } })
  async uploadCourseImage(@UploadedFile() file: Express.Multer.File) {
    const url = await this.uploadService.uploadCourseImage(file);
    return { url };
  }

  // FEAT-05: بيرجع url + hlsUrl + publicId
  @Post('course-video')
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('video', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { video: { type: 'string', format: 'binary' } } } })
  async uploadCourseVideo(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.uploadCourseVideo(file);
  }

  // FEAT-06: رفع المستندات (PDF, DOCX, PPTX)
  @Post('document')
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('document', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { document: { type: 'string', format: 'binary' } } } })
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.uploadDocument(file);
  }
}