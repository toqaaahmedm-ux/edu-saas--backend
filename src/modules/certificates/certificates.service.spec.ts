import { Test, TestingModule } from '@nestjs/testing';
import { CertificatesService } from './certificates.service';
import { CertificatesRepository } from './certificates.repository';

// ── Mock Repository ───────────────────────────────────────────────────────────
const mockCertificatesRepository = {
  findByStudentId: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
};

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('CertificatesService', () => {
  let service: CertificatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificatesService,
        { provide: CertificatesRepository, useValue: mockCertificatesRepository },
      ],
    }).compile();

    service = module.get<CertificatesService>(CertificatesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});