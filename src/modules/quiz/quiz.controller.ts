import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { GetUser } from '../../common/decorators/get-user.decorator';

@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get()
  getAllQuizzes() {
    return this.quizService.getAllQuizzes();
  }

  @Get(':id')
  getQuiz(@Param('id') id: string) {
    return this.quizService.getQuizWithQuestions(id);
  }

  @Post(':id/start')
  startQuiz(
    @Param('id') quizId: string,
    @GetUser() user: any,
  ) {
    return this.quizService.startQuiz(user.id, quizId);
  }

  @Post(':id/submit')
  submitQuiz(
    @Param('id') quizId: string,
    @GetUser() user: any,
    @Body() body: { answers: { questionId: string; answer: number }[] },
  ) {
    return this.quizService.submitQuiz(user.id, quizId, body.answers);
  }
}