import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(SessionAuthGuard)
@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  // ─── Teacher Endpoints أولاً (لازم تيجي قبل :id routes) ──────────────────

  @Post('teacher/create')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  createQuiz(
    @GetUser() user: any,
    @Body() body: {
      courseId: string;
      title: string;
      timeLimit?: number;
      passScore?: number;
      questions: {
        text: string;
        options: string[];
        correctIndex: number;
      }[];
    },
  ) {
    return this.quizService.createQuizWithQuestions(
      user.tenantId,
      user.id,
      body,
    );
  }

  @Get('teacher/course/:courseId')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  getQuizzesByCourse(
    @Param('courseId') courseId: string,
    @GetUser() user: any,
  ) {
    return this.quizService.getQuizzesByCourse(courseId, user.tenantId, user.id);
  }

  @Delete('teacher/:quizId')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  deleteQuiz(@Param('quizId') id: string, @GetUser() user: any) {
    return this.quizService.deleteQuiz(id, user.tenantId, user.id);
  }

  // ─── Student Endpoints (بعد الـ teacher routes) ───────────────────────────

  // S-SEC02 fix: optional ?courseId= query param, enforced against the
  // student's own enrollments inside the service.
  @Get()
  getAllQuizzes(@GetUser() user: any, @Query('courseId') courseId?: string) {
    return this.quizService.getAllQuizzes(user.tenantId, user.id, courseId);
  }

  @Get(':id')
  getQuiz(@Param('id') id: string, @GetUser() user: any) {
    return this.quizService.getQuizWithQuestions(id, user.tenantId, user.id);
  }

  @Post(':id/start')
  startQuiz(@Param('id') quizId: string, @GetUser() user: any) {
    return this.quizService.startQuiz(user.tenantId, user.id, quizId);
  }

  @Post(':id/submit')
  submitQuiz(
    @Param('id') quizId: string,
    @GetUser() user: any,
    @Body() body: { answers: { questionId: string; answer: number }[] },
  ) {
    return this.quizService.submitQuiz(user.tenantId, user.id, quizId, body.answers);
  }
}