import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 블록 목록 조회 시 사용하는 전역 쿼리 DTO.
 * 블록의 상태 필터링과 페이지네이션 처리를 위한 파라미터를 정의합니다.
 */
export class BlockRecordQueryDto {
  @ApiProperty({
    description: '조회할 블록 상태 (UNFINALIZED | SAFE | FINALIZED)',
    required: false,
  })
  @IsOptional()
  status?: string;

  @ApiProperty({ description: '페이지당 결과 수 (기본값: 20)', required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({ description: '페이지 번호 (0-indexed, 기본값: 0)', required: false, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  page?: number = 0;
}
