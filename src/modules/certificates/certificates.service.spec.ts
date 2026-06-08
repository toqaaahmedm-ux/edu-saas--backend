import { Test, TestingModule } from '@nestjs/testing';
import { CertificatesService } from './certificates.service';
import { CertificatesRepository } from './certificates.repository';
import { PrismaService } from '../../prisma/prisma.service';

const mockCertificatesRepository = {
  findByStudentId: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByStudentAndCourse: jest.fn(),
};

const mockPrismaService = {
  enrollment: {
    findUnique: jest.fn(),
  },
};

describe('CertificatesService', () => {
  let service: CertificatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificatesService,
        { provide: CertificatesRepository, useValue: mockCertificatesRepository },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CertificatesService>(CertificatesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});