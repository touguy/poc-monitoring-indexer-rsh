import { HttpStatus } from '@nestjs/common';

/**
 * 비즈니스 레이어에서 사용하는 표준 에러 코드 정의 클래스.
 * 에러마다 HTTP 상태 코드, 내부 에러 코드(code), 사용자 메시지를 함께 정의합니다.
 *
 * 명명 규칙:
 *   I*** → 인덱서/공통 에러
 *   B*** → 블록/Reorg 관련 에러
 */
export class ErrorCode {
  /** Transfer 이벤트를 DB에서 찾을 수 없는 경우 */
  static readonly NOT_FOUND_TRANSFER_EVENT = new ErrorCode(
    HttpStatus.NOT_FOUND,
    'I001',
    '이벤트를 찾을 수 없습니다',
  );

  /** 잘못된 컨트랙트 주소 형식으로 요청한 경우 */
  static readonly INVALID_CONTRACT_ADDRESS = new ErrorCode(
    HttpStatus.BAD_REQUEST,
    'I002',
    '유효하지 않은 컨트랙트 주소입니다',
  );

  /** 분류되지 않은 서버 내부 오류 */
  static readonly INTERNAL_SERVER_ERROR = new ErrorCode(
    HttpStatus.INTERNAL_SERVER_ERROR,
    'I999',
    '서버 내부 오류가 발생했습니다',
  );

  /** 요청한 블록 번호가 DB에 존재하지 않는 경우 */
  static readonly NOT_FOUND_BLOCK = new ErrorCode(
    HttpStatus.NOT_FOUND,
    'B001',
    '블록 정보를 찾을 수 없습니다',
  );

  /** Chain Reorg가 감지되어 데이터 정합성 충돌이 발생한 경우 */
  static readonly REORG_DETECTED = new ErrorCode(
    HttpStatus.CONFLICT,
    'B002',
    'Chain Reorg가 감지되었습니다',
  );

  /** 외부에서 직접 생성하지 못하도록 private 생성자로 제한 */
  private constructor(
    public readonly status: HttpStatus,
    public readonly code: string,
    public readonly message: string,
  ) {}
}
