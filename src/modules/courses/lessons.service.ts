import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { LessonsRepository } from './lessons.repository';
import { CoursesRepository } from './courses.repository';

@Injectable()
export class LessonsService {
  constructor(
    private lessonsRepository: LessonsRepository,
    private coursesRepository: CoursesRepository,
  ) {}

  async getLessons(courseId: string) {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');
    return this.lessonsRepository.findByCourseId(courseId);
  }

  async create(courseId: string, userId: string, userRole: string, data: {
    title: string;
    videoUrl?: string;
    duration?: number;
    order: number;
  }) {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    if (userRole !== 'ADMIN' && course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.create({ ...data, courseId });
  }

  async update(id: string, userId: string, userRole: string, data: {
    title?: string;
    videoUrl?: string;
    duration?: number;
    order?: number;
  }) {
    const lesson = await this.lessonsRepository.findById(id);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.coursesRepository.findById(lesson.courseId);
    if (userRole !== 'ADMIN' && course!.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.update(id, data);
  }

  async delete(id: string, userId: string, userRole: string) {
    const lesson = await this.lessonsRepository.findById(id);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.coursesRepository.findById(lesson.courseId);
    if (userRole !== 'ADMIN' && course!.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.delete(id);
  }
}