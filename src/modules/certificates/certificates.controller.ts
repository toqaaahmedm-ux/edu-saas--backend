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
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import { Role } from '@prisma/client';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('my')
  getMyCertificates(@GetUser() user: any) {
    return this.certificatesService.getMyCertificates(user.tenantId, user.id);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post('my')
  @AuditAction('CERTIFICATE_CREATED')
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

  // BE-C05 FIX: كان مفتوح بدون أي Guard خالص — أي حد (حتى من غير تسجيل
  // دخول) يقدر يشوف بيانات شخصية لطالب تاني بمعرفة الـ UUID بس. دلوقتي
  // محمي بـ SessionAuthGuard (لازم تسجيل دخول)، وبنبعت tenantId + user
  // للـ service عشان يتحقق إن الشهادة تبع نفس المستأجر وإن صاحب الطلب
  // هو الطالب نفسه أو ADMIN/TEACHER.
  @UseGuards(SessionAuthGuard)
  @Get(':id')
  @AuditAction('CERTIFICATE_ACCESSED')
  findOne(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.certificatesService.findById(id, user.tenantId, user.id, user.role);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  @Post()
  @AuditAction('CERTIFICATE_ISSUED')
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