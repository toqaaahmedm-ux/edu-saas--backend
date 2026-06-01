// src/modules/certificates/certificates.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CertificatesRepository } from './certificates.repository';

@Injectable()
export class CertificatesService {
  constructor(private readonly certificatesRepository: CertificatesRepository) {}

  async getMyCertificates(studentId: string) {
    return this.certificatesRepository.findByStudentId(studentId);
  }

  async findById(id: string) {
    const cert = await this.certificatesRepository.findById(id);
    if (!cert) throw new NotFoundException('Certificate not found');
    return cert;
  }

  async create(
    studentId: string,
    courseId: string,
    data: {
      examName: string;
      institutionName: string;
      facultyName: string;
    },
  ) {
    const existing = await this.certificatesRepository.findByStudentAndCourse(
      studentId,
      courseId,
    );
    if (existing) throw new ConflictException('Certificate already issued');

    return this.certificatesRepository.create({
      studentId,
      courseId,
      ...data,
    });
  }
}