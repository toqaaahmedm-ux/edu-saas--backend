import { IsOptional, IsString } from 'class-validator';

export class SubmitAssignmentDto {
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  textContent?: string;
}