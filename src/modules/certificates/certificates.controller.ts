import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
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

  // PDF-NEW: download the certificate as a real PDF generated server-side via Puppeteer,
  // instead of relying on window.print() in the browser. Uses the exact same Guard as
  // in findOne, so there's no change in the protection level.
  @UseGuards(SessionAuthGuard)
  @Get(':id/pdf')
  @AuditAction('CERTIFICATE_ACCESSED')
  async downloadPdf(
    @Param('id') id: string,
    @Query('lang') lang: string,
    @GetUser() user: any,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.certificatesService.generateCertificatePdf(
      id,
      user.tenantId,
      user.id,
      user.role,
      lang === 'ar' ? 'ar' : 'en',
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  // BE-C05 FIX: this used to be wide open with no Guard at all — anyone (even without
  // being logged in) could view another student's personal data just by knowing the UUID. Now it's
  // protected by SessionAuthGuard (must be logged in), and we pass tenantId + user
  // to the service to verify the certificate belongs to the same tenant and that the requester
  // is either the student themselves or ADMIN/TEACHER.
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