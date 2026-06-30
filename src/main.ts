import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser = require('cookie-parser');
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptors';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  app.use(cookieParser());

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://edu-saas-platform.vercel.app',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true, // ✅ BE-H03
  }));
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('EduSaaS API')
    .setDescription('API documentation for EduSaaS platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 4000);
  console.log(`Backend running on port ${process.env.PORT || 4000}`);
}
bootstrap();