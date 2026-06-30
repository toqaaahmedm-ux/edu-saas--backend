import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  name: string;

  @IsString()
  subdomain: string;

  @IsOptional()
  @IsUUID()
  planId?: string;
}