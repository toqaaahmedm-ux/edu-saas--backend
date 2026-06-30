import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';

@UseGuards(SessionAuthGuard)
@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get()
  getAllQuizzes(@GetUser() user: any) {
    return this.quizService.getAllQuizzes(user.tenantId);
  }

  @Get(':id')
  getQuiz(@Param('id') id: string, @GetUser() user: any) {
    return this.quizService.getQuizWithQuestions(id, user.tenantId); // ✅ BE-M03
  }

  @Post(':id/start')
  startQuiz(
    @Param('id') quizId: string,
    @GetUser() user: any,
  ) {
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