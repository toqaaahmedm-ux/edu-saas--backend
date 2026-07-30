import { IsIn, IsNotEmpty } from 'class-validator';

export class ReviewExcuseDto {
  @IsIn(['APPROVED', 'REJECTED'])
  @IsNotEmpty()
  decision: 'APPROVED' | 'REJECTED';
}
