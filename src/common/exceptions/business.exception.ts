import { ErrorCode } from './error-code.enum';

/**
 * 비즈니스 로직에서 발생하는 예외를 표현하는 커스텀 예외 클래스.
 * ErrorCode를 기반으로 생성되어 GlobalExceptionsFilter에서 HTTP 응답으로 변환됩니다.
 *
 * @example
 *   throw new BusinessException(ErrorCode.NOT_FOUND_BLOCK);
 */
export class BusinessException extends Error {
  public readonly errorCode: ErrorCode;

  constructor(errorCode: ErrorCode) {
    super(errorCode.message);
    this.errorCode = errorCode;
    this.name = 'BusinessException';
  }
}
