import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsRepository } from './enrollments.repository';
import { CoursesRepository } from '../courses/courses.repository';

// ── Mock Repositories ─────────────────────────────────────────────────────────
const mockEnrollmentsRepository = {
  findByStudentAndCourse: jest.fn(),
  create: jest.fn(),
  findByStudentId: jest.fn(),
  findByCourseId: jest.fn(),
};

const mockCoursesRepository = {
  findById: jest.fn(),
};

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('EnrollmentsService', () => {
  let service: EnrollmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: EnrollmentsRepository, useValue: mockEnrollmentsRepository },
        { provide: CoursesRepository, useValue: mockCoursesRepository },
      ],
    }).compile();

    service = module.get<EnrollmentsService>(EnrollmentsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});