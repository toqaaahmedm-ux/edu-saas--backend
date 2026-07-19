import { IsOptional, IsString } from 'class-validator';

// grades are computed automatically (see GradesService.recompute) —
// this DTO only covers the one thing a teacher can override by hand
export class UpdateGradeNotesDto {
  @IsOptional()
  @IsString()
  notes?: string;
}