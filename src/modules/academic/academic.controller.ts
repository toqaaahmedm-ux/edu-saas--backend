import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AcademicService } from './academic.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import { Role } from '@prisma/client';

// admin-only management of the academic structure lookup tables. Every
// route here requires ADMIN — teachers/students only ever read this data
// indirectly through Course/ClassSection relations, not through this
// controller directly.
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller()
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  // ─── Academic Years ───────────────────────────────────────────────────

  @Get('academic-years')
  getAcademicYears(@GetUser() user: any) {
    return this.academicService.getAcademicYears(user.tenantId);
  }

  @Post('academic-years')
  @AuditAction('ACADEMIC_YEAR_CREATED')
  createAcademicYear(@GetUser() user: any, @Body() body: any) {
    return this.academicService.createAcademicYear(user.tenantId, body);
  }

  @Patch('academic-years/:id')
  @AuditAction('ACADEMIC_YEAR_UPDATED')
  updateAcademicYear(@Param('id') id: string, @GetUser() user: any, @Body() body: any) {
    return this.academicService.updateAcademicYear(id, user.tenantId, body);
  }

  @Delete('academic-years/:id')
  @AuditAction('ACADEMIC_YEAR_DELETED')
  deleteAcademicYear(@Param('id') id: string, @GetUser() user: any) {
    return this.academicService.deleteAcademicYear(id, user.tenantId);
  }

  // ─── Semesters ────────────────────────────────────────────────────────

  @Get('semesters')
  getSemesters(@GetUser() user: any) {
    return this.academicService.getSemesters(user.tenantId);
  }

  @Post('semesters')
  @AuditAction('SEMESTER_CREATED')
  createSemester(@GetUser() user: any, @Body() body: any) {
    return this.academicService.createSemester(user.tenantId, body);
  }

  @Patch('semesters/:id')
  @AuditAction('SEMESTER_UPDATED')
  updateSemester(@Param('id') id: string, @GetUser() user: any, @Body() body: any) {
    return this.academicService.updateSemester(id, user.tenantId, body);
  }

  @Delete('semesters/:id')
  @AuditAction('SEMESTER_DELETED')
  deleteSemester(@Param('id') id: string, @GetUser() user: any) {
    return this.academicService.deleteSemester(id, user.tenantId);
  }

  // ─── Grade Levels ─────────────────────────────────────────────────────

  @Get('grade-levels')
  getGradeLevels(@GetUser() user: any) {
    return this.academicService.getGradeLevels(user.tenantId);
  }

  @Post('grade-levels')
  @AuditAction('GRADE_LEVEL_CREATED')
  createGradeLevel(@GetUser() user: any, @Body() body: any) {
    return this.academicService.createGradeLevel(user.tenantId, body);
  }

  @Patch('grade-levels/:id')
  @AuditAction('GRADE_LEVEL_UPDATED')
  updateGradeLevel(@Param('id') id: string, @GetUser() user: any, @Body() body: any) {
    return this.academicService.updateGradeLevel(id, user.tenantId, body);
  }

  @Delete('grade-levels/:id')
  @AuditAction('GRADE_LEVEL_DELETED')
  deleteGradeLevel(@Param('id') id: string, @GetUser() user: any) {
    return this.academicService.deleteGradeLevel(id, user.tenantId);
  }

  // ─── Class Sections ───────────────────────────────────────────────────

  @Get('class-sections')
  getClassSections(@GetUser() user: any) {
    return this.academicService.getClassSections(user.tenantId);
  }

  @Post('class-sections')
  @AuditAction('CLASS_SECTION_CREATED')
  createClassSection(@GetUser() user: any, @Body() body: any) {
    return this.academicService.createClassSection(user.tenantId, body);
  }

  @Patch('class-sections/:id')
  @AuditAction('CLASS_SECTION_UPDATED')
  updateClassSection(@Param('id') id: string, @GetUser() user: any, @Body() body: any) {
    return this.academicService.updateClassSection(id, user.tenantId, body);
  }

  @Delete('class-sections/:id')
  @AuditAction('CLASS_SECTION_DELETED')
  deleteClassSection(@Param('id') id: string, @GetUser() user: any) {
    return this.academicService.deleteClassSection(id, user.tenantId);
  }

  // ─── Class Sessions (Timetable/Schedule) ─────────────────────────────
  // GET is open to STUDENT/TEACHER/ADMIN so the schedule renders for
  // everyone; writes stay ADMIN-only like the rest of this controller.

  @Roles(Role.STUDENT, Role.TEACHER, Role.ADMIN)
  @Get('class-sessions')
  getClassSessions(@GetUser() user: any, @Query('courseId') courseId?: string) {
    return this.academicService.getClassSessions(user.tenantId, courseId);
  }

  @Roles(Role.ADMIN)
  @Post('class-sessions')
  @AuditAction('CLASS_SESSION_CREATED')
  createClassSession(@GetUser() user: any, @Body() body: any) {
    return this.academicService.createClassSession(user.tenantId, body);
  }

  @Roles(Role.ADMIN)
  @Patch('class-sessions/:id')
  @AuditAction('CLASS_SESSION_UPDATED')
  updateClassSession(@Param('id') id: string, @GetUser() user: any, @Body() body: any) {
    return this.academicService.updateClassSession(id, user.tenantId, body);
  }

  @Roles(Role.ADMIN)
  @Delete('class-sessions/:id')
  @AuditAction('CLASS_SESSION_DELETED')
  deleteClassSession2(@Param('id') id: string, @GetUser() user: any) {
    return this.academicService.deleteClassSession(id, user.tenantId);
  }
}