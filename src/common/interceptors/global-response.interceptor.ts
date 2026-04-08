import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ResultResDto } from '../dto/result-res.dto';

/**
 * 전역 응답 인터셉터.
 * 컨트롤러에서 반환된 모든 값을 자동으로 ResultResDto 형식으로 감쌉니다.
 * GlobalExceptionsFilter와 함께 응답 형식을 일관되게 유지합니다.
 */
@Injectable()
export class GlobalResponseInterceptor<T> implements NestInterceptor<T, ResultResDto<T>> {
  /**
   * 컨트롤러 응답을 ResultResDto로 변환합니다.
   * 변환 규칙:
   *   1. 이미 ResultResDto 인스턴스 → 그대로 통과
   *   2. { data, message } 형태 → successWithMessage()로 래핑
   *   3. 그 외 모든 값          → success()로 래핑
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResultResDto<T>> {
    return next.handle().pipe(
      map((res) => {
        // 이미 ResultResDto 형태인지 확인 → 중복 래핑 방지
        if (res instanceof ResultResDto) {
          return res;
        }

        // Service에서 { data, message } 형태로 반환한 경우
        if (typeof res === 'object' && res !== null && 'data' in res && 'message' in res) {
          return ResultResDto.successWithMessage(res.data, res.message);
        }

        // 그 외 형태는 모두 success data로 감싼다
        return ResultResDto.success(res);
      }),
    );
  }
}
