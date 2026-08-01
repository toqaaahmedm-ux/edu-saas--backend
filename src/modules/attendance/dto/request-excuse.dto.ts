import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class RequestExcuseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;

  // optional — the frontend uploads the file first via /upload/document
  // and sends the resulting URL here
  @IsString()
  @IsOptional()
  fileUrl?: string;
}
