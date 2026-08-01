import { IsEmail, IsString, IsOptional, IsIn, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  // FIX (Admin Report Bug #1): was MinLength(6), frontend's Zod schema
  // already requires 8 — this just makes the backend match what the UI
  // promises instead of silently accepting weaker passwords.
  @IsString()
  @MinLength(8)
  password!: string;

  // FIX (Admin Report Bug #1): this field didn't exist at all, so
  // role: "TEACHER" sent by the frontend was rejected outright by the
  // global forbidNonWhitelisted pipe (HTTP 400), and even the one
  // registration path that got through silently fell back to STUDENT.
  //
  // Only STUDENT/TEACHER are accepted here — ADMIN and SUPER_ADMIN can
  // never be granted through public self-registration, only by an
  // existing admin (see users.service.ts) or the tenant-provisioning flow.
  @IsOptional()
  @IsIn(['STUDENT', 'TEACHER'])
  role?: 'STUDENT' | 'TEACHER';
}