import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { QuizRepository } from './quiz.repository';

@Injectable()
export class QuizService {
  constructor(private readonly quizRepository: QuizRepository) {}

  async getAllQuizzes() {
    return this.quizRepository.findAllWithCourse();
  }

  async getQuizWithQuestions(quizId: string) {
    const quiz = await this.quizRepository.findByIdWithQuestions(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');
    return quiz;
  }

  async startQuiz(studentId: string, quizId: string) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    // امسح أي attempt قديم غير مكتمل
    await this.quizRepository.deleteIncompleteAttempt(studentId, quizId);

    const attempt = await this.quizRepository.createAttempt(studentId, quizId);
    return { attemptId: attempt.id, startedAt: attempt.startedAt };
  }

  async submitQuiz(
    studentId: string,
    quizId: string,
    answers: { questionId: string; answer: number }[],
  ) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const attempt = await this.quizRepository.findAttempt(studentId, quizId);
    if (!attempt) throw new BadRequestException('You must start the quiz first');

    // ── BUG-05: التحقق من الوقت على السيرفر ──
    if (quiz.timeLimit) {
      const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000;
      const allowedSeconds = quiz.timeLimit + 5; // 5 ثواني سماحية
      if (elapsed > allowedSeconds) {
        await this.quizRepository.updateAttemptScore(attempt.id, 0);
        throw new BadRequestException('Quiz time limit exceeded');
      }
    }

    // جلب الأسئلة مع الإجابات الصحيحة
    const questions = await this.quizRepository.findQuestionsByQuizId(quizId);

    // حساب النقاط
    let correct = 0;
    for (const question of questions) {
      const submitted = answers.find((a) => a.questionId === question.id);
      if (submitted && Number(submitted.answer) === question.correctIndex) {
        correct++;
      }
    }

    const score = questions.length > 0
      ? Math.round((correct / questions.length) * 100)
      : 0;

    await this.quizRepository.updateAttemptScore(attempt.id, score);

    return {
      score,
      correct,
      total: questions.length,
      passed: score >= 60,
    };
  }
}