import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation via class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Izinkan akses dari frontend (Next.js dev / Vercel)
  app.enableCors();

  // Base path /api/v1
  app.setGlobalPrefix('api/v1');

  // Swagger — otomatis sync dengan dekorator @ApiTags / @ApiOperation
  const config = new DocumentBuilder()
    .setTitle('NineOS API Gateway')
    .setDescription('Central dashboard API untuk 4 platform: Matcha, NotaBe, Krama, Nine Studio')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`NineOS API berjalan di http://localhost:${port}/api/v1`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
