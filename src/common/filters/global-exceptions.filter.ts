import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ResultResDto } from '../dto/result-res.dto';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCode } from '../exceptions/error-code.enum';

/**
 * 전역 예외 처리 필터.
 * 애플리케이션에서 발생하는 모든 예외를 가로채어 일관된 JSON 응답 형식으로 변환합니다.
 *
 * 처리 우선순위:
 *   1. BusinessException → ErrorCode 기반 응답 (도메인 예외)
 *   2. HttpException     → NestJS/HTTP 예외 (ValidationPipe 포함)
 *   3. 그 외             → 500 Internal Server Error
 */
@Catch()
export class GlobalExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}

  /**
   * 예외를 가로채어 HTTP 응답으로 변환합니다.
   * 모든 예외는 ResultResDto.error() 형식으로 응답됩니다.
   */
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // 기본값은 서버 내부 오류
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '내부 서버 오류가 발생했습니다.';
    let code: string | undefined = ErrorCode.INTERNAL_SERVER_ERROR.code;

    if (exception instanceof BusinessException) {
      // 도메인 비즈니스 예외: ErrorCode에 정의된 HTTP 상태와 메시지 사용
      status = exception.errorCode.status;
      message = exception.errorCode.message;
      code = exception.errorCode.code;
    } else if (exception instanceof HttpException) {
      // NestJS 표준 HTTP 예외 (ValidationPipe의 400 오류 포함)
      status = exception.getStatus();
      const res = exception.getResponse() as any;

      message = typeof res === 'string' ? res : res.message || exception.message;

      // ValidationPipe는 메시지를 배열로 반환: 첫 번째 메시지만 사용
      if (Array.isArray(message)) {
        message = message[0];
      }
      code = undefined;
    }

    // 서버 로그에 예외 상세 정보를 기록 (stack trace 포함)
    this.logger.error('Exception Filter Caught:', {
      error: exception instanceof Error ? exception.message : 'Unknown exception',
      stack: exception instanceof Error ? exception.stack : undefined,
      status,
    });

    // 일관된 오류 응답 형식으로 반환
    response.status(status).json(ResultResDto.error(message, code));
  }
}
