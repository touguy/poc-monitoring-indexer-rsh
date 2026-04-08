export class ResultResDto<T> {
  /** 요청 성공 여부 */
  success: boolean;
  /** 응답 데이터 */
  data?: T;
  /** 성공/오류 메시지 */
  message?: string;
  /** 비즈니스 에러 코드 (오류 시에만 포함) */
  errorCode?: string;

  /**
   * 외부에서 직접 생성하지 못하도록 private 생성자로 제한.
   * 아래의 정적 팩토리 메서드(success/error)를 통해 생성합니다.
   */
  private constructor(success: boolean, data?: T, message?: string, errorCode?: string) {
    this.success = success;
    this.data = data;
    this.message = message;
    this.errorCode = errorCode;
  }

  /**
   * 성공 응답 생성 (메시지 없음).
   * 단순 데이터 조회/저장 결과를 반환할 때 사용합니다.
   */
  static success<T>(data: T): ResultResDto<T> {
    return new ResultResDto<T>(true, data);
  }

  /**
   * 성공 응답 생성 (메시지 포함).
   * Service에서 { data, message } 형태로 반환할 때 인터셉터가 이 메서드를 호출합니다.
   */
  static successWithMessage<T>(data: T, message: string): ResultResDto<T> {
    return new ResultResDto<T>(true, data, message);
  }

  /**
   * 오류 응답 생성.
   * GlobalExceptionsFilter에서 예외 발생 시 호출됩니다.
   */
  static error<T>(message: string, errorCode?: string): ResultResDto<T> {
    return new ResultResDto<T>(false, undefined, message, errorCode);
  }
}
