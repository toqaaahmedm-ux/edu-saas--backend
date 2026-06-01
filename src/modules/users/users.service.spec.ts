import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

// ── Mock Repository ───────────────────────────────────────────────────────────
const mockUsersRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByIdWithPassword: jest.fn(),
  updateProfile: jest.fn(),
  updatePassword: jest.fn(),
  updateRole: jest.fn(),
  delete: jest.fn(),
};

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: mockUsersRepository },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});