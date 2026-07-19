import { IsOptional, IsString, IsUrl, Matches } from 'class-validator';

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  // Basic hex color validation (#fff or #ffffff) — keeps bad values
  // from ever reaching the DB and breaking the frontend's inline styles.
  @IsOptional()
  @Matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
    message: 'primaryColor must be a valid hex color, e.g. #2563EB',
  })
  primaryColor?: string;
}