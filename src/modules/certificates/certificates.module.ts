import { Module } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { AuthModule } from '../auth/auth.module';
import { CertificatesRepository } from './certificates.repository';

@Module({
  imports: [AuthModule],
  controllers: [CertificatesController],
  providers: [CertificatesService,CertificatesRepository ],
  exports: [CertificatesService],
})
export class CertificatesModule {}