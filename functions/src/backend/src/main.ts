// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Serve static files
  // app.use('/uploads/issue_attachment', express.static(join(__dirname, '..', 'uploads/issue_attachment')));

  
  // ตั้งค่า CORS สำหรับใช้ JWT Token
  app.enableCors({
    origin: [
    process.env.FRONTEND_URL,
    'https://helpdesk-support-44934.web.app',    // กัน fail หาก ENV โหลดไม่ทัน
  ],
    credentials: false,               // เปลี่ยนเป็น false เพราะไม่ใช้ cookie
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
      'language',                   // Custom header ของคุณ
      'user-id',                   // Custom header ของคุณ
      'api-key'                    // Custom header ของคุณ
    ],
  });

  // ตั้งค่า ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: false,
      disableErrorMessages: false,
    }),
  );

  // อ่านค่า PORT จาก .env หรือใช้ค่าเริ่มต้น 3000
  const port = process.env.PORT || 3000;

  // ใช้ HttpExceptionFilter ทั่วทั้งแอปพลิเคชัน
  app.useGlobalFilters(new HttpExceptionFilter());

  // ✅ เพิ่ม limit สำหรับ request body
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
  
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: http://0.0.0.0:${port}`);
  console.log(`🌍 External access: http://[your-ip]:${port}`);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`🔌 WebSocket is available at: ws://localhost:${port}/notifications`);
}
bootstrap(); 