import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ModulesRepository } from './modules.repository';
import { CoursesService } from '../courses/courses.service';

@Injectable()
export class ModulesService {
  constructor(
    private readonly modulesRepository: ModulesRepository,
    private readonly coursesService: CoursesService,
  ) {}

  // بيتأكد إن الكورس موجود، تابع لنفس الـ tenant، وإن المدرّس هو المالك
  // (أو Admin) — نفس فحص الملكية المستخدم في createLesson/updateLesson
  private async assertCourseOwnership(
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
  ) {
    const course = await this.coursesService.findById(courseId, tenantId);
    if (userRole !== 'ADMIN' && course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }
    return course;
  }

  async findAllByCourse(courseId: string, tenantId: string) {
    return this.modulesRepository.findAllByCourse(courseId, tenantId);
  }

  async findById(id: string, tenantId: string) {
    const module = await this.modulesRepository.findById(id, tenantId);
    if (!module) throw new NotFoundException('Module not found');
    return module;
  }

  async create(
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    data: { title: string; description?: string; order?: number },
  ) {
    if (!data.title?.trim()) throw new BadRequestException('Title is required');
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);

    const order = data.order ?? (await this.modulesRepository.getNextOrder(courseId));

    return this.modulesRepository.create({
      tenantId,
      courseId,
      title: data.title,
      description: data.description,
      order,
    });
  }

  async update(
    id: string,
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    data: { title?: string; description?: string; order?: number },
  ) {
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);
    await this.findById(id, tenantId);
    return this.modulesRepository.update(id, data, tenantId);
  }

  async delete(
    id: string,
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
  ) {
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);
    await this.findById(id, tenantId);
    await this.modulesRepository.delete(id, tenantId);
    return { message: 'Module deleted successfully' };
  }
}