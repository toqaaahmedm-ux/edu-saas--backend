import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// These 4 models (AcademicYear, Semester, GradeLevel, ClassSection) are
// simple admin-managed lookup tables â€” same tenantId-scoped CRUD shape
// four times over. One service instead of four nearly-identical files.
@Injectable()
export class AcademicService {
  constructor(private prisma: PrismaService) {}

  // â”€â”€â”€ Academic Years â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getAcademicYears(tenantId: string) {
    return this.prisma.academicYear.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
    });
  }

  async createAcademicYear(
    tenantId: string,
    data: { name: string; startDate: string; endDate: string; isActive?: boolean },
  ) {
    if (!data.name?.trim()) throw new BadRequestException('Name is required');
    return this.prisma.academicYear.create({
      data: {
        tenantId,
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isActive: data.isActive ?? false,
      },
    });
  }

  async updateAcademicYear(id: string, tenantId: string, data: any) {
    await this.assertExists('academicYear', id, tenantId);
    if (data.isActive === true) {
      return this.prisma.$transaction(async (tx) => {
        await tx.academicYear.updateMany({ where: { tenantId, id: { not: id } }, data: { isActive: false } });
        return tx.academicYear.update({
          where: { id, tenantId },
          data: {
            ...(data.name && { name: data.name }),
            ...(data.startDate && { startDate: new Date(data.startDate) }),
            ...(data.endDate && { endDate: new Date(data.endDate) }),
            isActive: true,
          },
        });
      });
    }
    return this.prisma.academicYear.update({
      where: { id, tenantId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteAcademicYear(id: string, tenantId: string) {
    await this.assertExists('academicYear', id, tenantId);
    await this.prisma.academicYear.delete({ where: { id, tenantId } });
    return { message: 'Academic year deleted' };
  }

  // â”€â”€â”€ Semesters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getSemesters(tenantId: string) {
    return this.prisma.semester.findMany({
      where: { tenantId },
      include: { academicYear: { select: { name: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async createSemester(
    tenantId: string,
    data: { academicYearId: string; name: string; startDate: string; endDate: string; isActive?: boolean },
  ) {
    if (!data.name?.trim()) throw new BadRequestException('Name is required');
    if (!data.academicYearId) throw new BadRequestException('academicYearId is required');
    return this.prisma.semester.create({
      data: {
        tenantId,
        academicYearId: data.academicYearId,
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isActive: data.isActive ?? false,
      },
    });
  }

  async updateSemester(id: string, tenantId: string, data: any) {
    await this.assertExists('semester', id, tenantId);
    if (data.isActive === true) {
      const current = await this.prisma.semester.findUnique({ where: { id } });
      return this.prisma.$transaction(async (tx) => {
        await tx.semester.updateMany({ where: { tenantId, academicYearId: current.academicYearId, id: { not: id } }, data: { isActive: false } });
        return tx.semester.update({
          where: { id, tenantId },
          data: {
            ...(data.name && { name: data.name }),
            ...(data.startDate && { startDate: new Date(data.startDate) }),
            ...(data.endDate && { endDate: new Date(data.endDate) }),
            isActive: true,
          },
        });
      });
    }
    return this.prisma.semester.update({
      where: { id, tenantId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteSemester(id: string, tenantId: string) {
    await this.assertExists('semester', id, tenantId);
    await this.prisma.semester.delete({ where: { id, tenantId } });
    return { message: 'Semester deleted' };
  }

  // â”€â”€â”€ Grade Levels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getGradeLevels(tenantId: string) {
    return this.prisma.gradeLevel.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });
  }

  async createGradeLevel(tenantId: string, data: { name: string; order?: number }) {
    if (!data.name?.trim()) throw new BadRequestException('Name is required');
    const order = data.order ?? (await this.prisma.gradeLevel.count({ where: { tenantId } }));
    return this.prisma.gradeLevel.create({
      data: { tenantId, name: data.name, order },
    });
  }

  async updateGradeLevel(id: string, tenantId: string, data: any) {
    await this.assertExists('gradeLevel', id, tenantId);
    return this.prisma.gradeLevel.update({
      where: { id, tenantId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.order !== undefined && { order: data.order }),
      },
    });
  }

  async deleteGradeLevel(id: string, tenantId: string) {
    await this.assertExists('gradeLevel', id, tenantId);
    await this.prisma.gradeLevel.delete({ where: { id, tenantId } });
    return { message: 'Grade level deleted' };
  }

  // â”€â”€â”€ Class Sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getClassSections(tenantId: string) {
    return this.prisma.classSection.findMany({
      where: { tenantId },
      include: {
        gradeLevel: { select: { name: true } },
        _count: { select: { students: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createClassSection(
    tenantId: string,
    data: { gradeLevelId: string; name: string; homeroomTeacherId?: string },
  ) {
    if (!data.name?.trim()) throw new BadRequestException('Name is required');
    if (!data.gradeLevelId) throw new BadRequestException('gradeLevelId is required');
    return this.prisma.classSection.create({
      data: {
        tenantId,
        gradeLevelId: data.gradeLevelId,
        name: data.name,
        homeroomTeacherId: data.homeroomTeacherId,
      },
    });
  }

  async updateClassSection(id: string, tenantId: string, data: any) {
    await this.assertExists('classSection', id, tenantId);
    return this.prisma.classSection.update({
      where: { id, tenantId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.homeroomTeacherId !== undefined && { homeroomTeacherId: data.homeroomTeacherId }),
      },
    });
  }

  async deleteClassSection(id: string, tenantId: string) {
    await this.assertExists('classSection', id, tenantId);
    await this.prisma.classSection.delete({ where: { id, tenantId } });
    return { message: 'Class section deleted' };
  }

  // shared existence + tenant-ownership check, used by every update/delete
  // above so a bad id gives a clean 404 instead of a raw Prisma P2025 error
  private async assertExists(model: 'academicYear' | 'semester' | 'gradeLevel' | 'classSection', id: string, tenantId: string) {
    const record = await (this.prisma[model] as any).findFirst({ where: { id, tenantId } });
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }
}

