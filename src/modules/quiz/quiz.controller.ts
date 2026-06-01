// src/modules/quiz/quiz.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';

@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) { }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAllQuizzes() {
    return this.quizService.getAllQuizzes();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getQuiz(@Param('id') id: string) {
    return this.quizService.getQuizWithQuestions(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/start')
  startQuiz(
    @Param('id') quizId: string,
    @GetUser() user: any,
  ) {
    return this.quizService.startQuiz(user.id, quizId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/submit')
  submitQuiz(
    @Param('id') quizId: string,
   @GetUser() user: any,
    @Body() body: { answers: { questionId: string; answer: number }[] },
  ) {
return this.quizService.submitQuiz(user.id, quizId, body.answers);
  }
}