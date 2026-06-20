import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('my')
  getMyCertificates(@GetUser() user: any) {
    // Multi-tenant: بنبعت tenantId من الـ user
    return this.certificatesService.getMyCertificates(user.tenantId, user.id);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post('my')
  createMyCertificate(
    @GetUser() user: any,
    @Body() body: { courseId: string; examName?: string; institutionName?: string; facultyName?: string },
  ) {
    return this.certificatesService.create(user.tenantId, user.id, body.courseId, {
      examName:        body.examName        || 'General Exam',
      institutionName: body.institutionName || 'EduSaaS',
      facultyName:     body.facultyName     || 'Online Learning',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.certificatesService.findById(id);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
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
    return this.certificatesService.create(user.tenantId, body.studentId, body.courseId, {
      examName:        body.examName,
      institutionName: body.institutionName,
      facultyName:     body.facultyName,
    });
  }
}