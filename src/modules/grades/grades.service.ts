import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { GradesRepository } from './grades.repository';
import { CoursesService } from '../courses/courses.service';

// standard percentage -> letter mapping, used unless the tenant picks
// something else via Tenant.gradeScale later (CUSTOM scales aren't
// implemented yet — falls back to this table)
const LETTER_SCALE: { min: number; letter: string; gpa: number }[] = [
  { min: 93, letter: 'A', gpa: 4.0 },
  { min: 90, letter: 'A-', gpa: 3.7 },
  { min: 87, letter: 'B+', gpa: 3.3 },
  { min: 83, letter: 'B', gpa: 3.0 },
  { min: 80, letter: 'B-', gpa: 2.7 },
  { min: 77, letter: 'C+', gpa: 2.3 },
  { min: 73, letter: 'C', gpa: 2.0 },
  { min: 70, letter: 'C-', gpa: 1.7 },
  { min: 60, letter: 'D', gpa: 1.0 },
  { min: 0, letter: 'F', gpa: 0.0 },
];

function letterAndGpaFor(score: number) {
  const row = LETTER_SCALE.find((r) => score >= r.min) ?? LETTER_SCALE[LETTER_SCALE.length - 1];
  return { letter: row.letter, gpa: row.gpa };
}

@Injectable()
export class GradesService {
  constructor(
    private readonly gradesRepository: GradesRepository,
    private readonly coursesService: CoursesService,
  ) {}

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

  // weighted 40% quizzes / 60% assignments when both exist — assignments
  // count more since they're usually the bigger, graded-by-hand work.
  // falls back to whichever category actually has data so a course with
  // quizzes but no assignments yet (or vice versa) still gets a real grade.
  async recompute(courseId: string, studentId: string, tenantId: string) {
    const [tenant, quizScores, assignmentScores] = await Promise.all([
      this.gradesRepository.getTenant(tenantId),
      this.gradesRepository.getQuizScores(courseId, studentId, tenantId),
      this.gradesRepository.getAssignmentScores(courseId, studentId, tenantId),
    ]);

    const quizAvg = quizScores.length
      ? quizScores.reduce((sum, q) => sum + q.score, 0) / quizScores.length
      : null;

    const assignmentAvg = assignmentScores.length
      ? assignmentScores.reduce(
          (sum, s) => sum + ((s.score ?? 0) / s.assignment.maxScore) * 100,
          0,
        ) / assignmentScores.length
      : null;

    let finalScore: number;
    if (quizAvg !== null && assignmentAvg !== null) {
      finalScore = quizAvg * 0.4 + assignmentAvg * 0.6;
    } else if (assignmentAvg !== null) {
      finalScore = assignmentAvg;
    } else if (quizAvg !== null) {
      finalScore = quizAvg;
    } else {
      finalScore = 0;
    }
    finalScore = Math.round(finalScore * 100) / 100;

    const { letter, gpa } = letterAndGpaFor(finalScore);

    return this.gradesRepository.upsert({
      tenantId,
      studentId,
      courseId,
      score: finalScore,
      letterGrade: letter,
      // GPA only makes sense for university-type tenants — schools/tutors
      // use the letter grade or raw percentage instead
      gpa: tenant?.type === 'UNIVERSITY' ? gpa : null,
    });
  }

  async getByCourse(courseId: string, tenantId: string, userId: string, userRole: string) {
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);
    return this.gradesRepository.findByCourse(courseId, tenantId);
  }

  async getMyGrade(courseId: string, studentId: string, tenantId: string) {
    const grade = await this.gradesRepository.findByStudentAndCourse(courseId, studentId, tenantId);
    if (!grade) throw new NotFoundException('No grade computed for this course yet');
    return grade;
  }

  async updateNotes(
    gradeId: string,
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    notes: string,
  ) {
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);
    return this.gradesRepository.updateNotes(gradeId, notes, tenantId);
  }
}