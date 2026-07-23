import { IsString, IsEmail, MinLength, IsIn } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsIn(['TEACHER', 'STUDENT'])
  role: 'TEACHER' | 'STUDENT';
}
