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
import { GetUser } from '../../common/decorators/get-user.decorator';
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
  async uploadCourseImage(
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: any,
  ) {
    const url = await this.uploadService.uploadCourseImage(file, user.tenantId, user.id);
    return { url };
  }

  // FEAT-05: Ø¨ÙŠØ±Ø¬Ø¹ url + hlsUrl + publicId
  @Post('course-video')
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('video', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { video: { type: 'string', format: 'binary' } } } })
  async uploadCourseVideo(
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: any,
  ) {
    return this.uploadService.uploadCourseVideo(file, user.tenantId, user.id);
  }

  // FEAT-06: Ø±ÙØ¹ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª (PDF, DOCX, PPTX)
  @Post('document')
  @Roles('STUDENT', 'TEACHER', 'ADMIN')
  @UseInterceptors(FileInterceptor('document', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { document: { type: 'string', format: 'binary' } } } })
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: any,
  ) {
    return this.uploadService.uploadDocument(file, user.tenantId, user.id);
  }
}