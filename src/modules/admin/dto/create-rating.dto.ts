import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class CreateRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  value: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}