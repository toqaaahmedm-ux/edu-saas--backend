import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

const mockAppService = {
  getHello: jest.fn().mockReturnValue('EduSaaS API is running!'),
  getAdminStats: jest.fn(),
};

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: mockAppService },
      ],
    })
      .overrideGuard(SessionAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    appController = app.get<AppController>(AppController);
    jest.clearAllMocks();
  });

  describe('root', () => {
    it('should return "EduSaaS API is running!"', () => {
      mockAppService.getHello.mockReturnValue('EduSaaS API is running!');
      expect(appController.getHello()).toBe('EduSaaS API is running!');
    });
  });
});