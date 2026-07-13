import { IsString, IsOptional, IsUUID, IsEmail, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  name: string;

  @IsString()
  subdomain: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  // SA-C01 fix: these three were already accepted by the service signature
  // but silently dropped — the DTO whitelist was rejecting them before they
  // ever reached the service, and even if they'd gotten through, nothing
  // used them to create an owner account.
  @IsString()
  ownerName: string;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(8)
  ownerPassword: string;
}