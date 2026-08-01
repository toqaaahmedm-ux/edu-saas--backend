import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GradeSubmissionDto {
  // "!" tells TypeScript this field is filled in from the request body
  // at runtime, even though there's no default value here. Without it,
  // strict mode throws TS2564 ("no initializer").
  @IsInt()
  @Min(0)
  score!: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}