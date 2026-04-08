import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { AppModule } from './app.module';

/**
 * 애플리케이션 진입점(Entry Point).
 * NestJS 앱을 초기화하고 글로벌 설정(로거, 파이프)을 등록한 뒤 서버를 시작합니다.
 */
async function bootstrap() {
  // bufferLogs: true → 로거가 준비되기 전에 발생한 로그를 버퍼링해서 나중에 출력
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Winston 로거를 NestJS 기본 로거 대신 전역 로거로 등록
  const logger = app.get<Logger>(WINSTON_MODULE_PROVIDER);
  app.useLogger(logger);

  // 글로벌 ValidationPipe: DTO 유효성 검사 자동 적용
  // - transform: 요청 데이터를 DTO 타입으로 자동 변환
  // - whitelist: DTO에 없는 필드 자동 제거 (보안)
  // - forbidNonWhitelisted: 화이트리스트 외 필드 존재 시 400 오류 반환
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // PORT 환경변수에서 포트 번호를 읽어오고, 없으면 기본값 3000 사용
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);
  logger.info(`Application is running on: http://localhost:${port}`);
}
void bootstrap();
