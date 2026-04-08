import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Reorg 로그 조회 시 사용하는 쿼리 DTO.
 * 특정 블록 범위(from ~ to) 내의 Reorg 이력을 필터링하기 위한 파라미터를 정의합니다.
 */
export class ReorgLogQueryDto {
  @ApiProperty({ description: '조회 시작 블록 번호 (0 이상)', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fromBlock?: number;

  @ApiProperty({ description: '조회 종료 블록 번호 (0 이상)', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  toBlock?: number;
}
