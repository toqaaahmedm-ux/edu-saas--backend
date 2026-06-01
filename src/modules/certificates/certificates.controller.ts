import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('my')
  getMyCertificates(@GetUser() user: any) {
    return this.certificatesService.getMyCertificates(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post('my')
  createMyCertificate(
    @GetUser() user: any,
    @Body() body: { courseId: string; examName?: string; institutionName?: string; facultyName?: string },
  ) {
    return this.certificatesService.create(user.id, body.courseId, {
      examName: body.examName || 'General Exam',
      institutionName: body.institutionName || 'EduSaaS',
      facultyName: body.facultyName || 'Online Learning',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.certificatesService.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  @Post()
  create(
    @GetUser() user: any,
    @Body() body: {
      studentId: string;
      courseId: string;
      examName: string;
      institutionName: string;
      facultyName: string;
    },
  ) {
    return this.certificatesService.create(body.studentId, body.courseId, {
      examName: body.examName,
      institutionName: body.institutionName,
      facultyName: body.facultyName,
    });
  }
}