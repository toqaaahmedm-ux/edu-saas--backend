-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'TRUE_FALSE', 'SHORT_ANSWER');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "correctText" TEXT,
ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'MCQ',
ALTER COLUMN "correctIndex" DROP NOT NULL;
