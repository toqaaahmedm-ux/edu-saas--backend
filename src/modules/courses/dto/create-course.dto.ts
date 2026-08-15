import { IsString, IsOptional, IsNumber, Min, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class CreateCourseDto {
  @ApiProperty({ example: 'Introduction to Python' })
  @IsString()
  title: string;
  @ApiProperty({ example: 'A beginner-friendly course covering Python basics.' })
  @IsString()
  description: string;
  @ApiPropertyOptional({ example: 'https://example.com/thumb.jpg' })
  @IsOptional()
  @IsString()
  thumbnail?: string;
  @ApiPropertyOptional({ example: 'Programming' })
  @IsOptional()
  @IsString()
  category?: string;
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
  @ApiPropertyOptional({ example: 'https://example.com/intro.mp4' })
  @IsOptional()
  @IsString()
  videoUrl?: string;
  @ApiPropertyOptional({ example: 'CS101' })
  @IsOptional()
  @IsString()
  courseCode?: string;
  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  credits?: number;
}
