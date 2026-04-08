import { ConfigService } from '@nestjs/config';
import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Winston 로거 설정 팩토리 함수.
 * AppModule의 WinstonModule.forRootAsync()에서 주입되어 로거 인스턴스를 생성합니다.
 *
 * Transport(출력 대상):
 *   1. Console    → 개발 환경에서 색상 포함 포맷으로 출력
 *   2. error.log  → ERROR 레벨 이상만 날짜별 파일 저장 (30일 보관)
 *   3. combined   → INFO 레벨 이상 모두 날짜별 파일 저장 (14일 보관)
 */
export const getWinstonOptions = (configService: ConfigService): WinstonModuleOptions => {
  const appName = configService.get<string>('APP_NAME', 'indexer-service');

  // 파일 출력용 포맷: 타임스탬프 + 에러 스택 + JSON 직렬화
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  );

  // 콘솔 출력용 포맷: 가독성 높은 색상 텍스트 형식
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, context, stack, ...meta }) => {
      const ts = timestamp;
      const ctx = context ? `[${context}] ` : '';
      // 추가 메타 데이터가 있으면 JSON으로 덧붙임
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      const stackStr = stack ? `\n${stack}` : '';
      return `${ts} [${appName}] ${level}: ${ctx}${message}${metaStr}${stackStr}`;
    }),
  );

  return {
    transports: [
      // 콘솔: 개발 환경은 debug, 프로덕션은 info 이상 출력
      new winston.transports.Console({
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        format: consoleFormat,
      }),
      // 에러 전용 파일: logs/YYYY-MM-DD-error.log (최대 30일 보관)
      new DailyRotateFile({
        dirname: 'logs',
        filename: `%DATE%-error.log`,
        level: 'error',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '30d',
        format: logFormat,
      }),
      // 통합 로그 파일: logs/YYYY-MM-DD-combined.log (최대 14일 보관)
      new DailyRotateFile({
        dirname: 'logs',
        filename: `%DATE%-combined.log`,
        level: 'info',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        format: logFormat,
      }),
    ],
  };
};
