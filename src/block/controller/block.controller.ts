import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { BlockRecordQueryDto } from '../dto/block-record-query.dto';
import { BlockService } from '../service/block.service';

/**
 * 블록 레코드 조회 API 컨트롤러.
 * Swagger 태그: 'Blocks'
 *
 * 엔드포인트:
 *   GET /blocks              → 블록 목록 조회 (상태 필터, 페이지네이션)
 *   GET /blocks/:blockNumber → 특정 블록 번호 조회
 */
@ApiTags('Blocks')
@Controller('blocks')
export class BlockController {
  constructor(private readonly blockService: BlockService) {}

  /** 블록 목록을 상태(UNFINALIZED/SAFE/FINALIZED) 및 페이지 파라미터로 조회합니다. */
  @ApiOperation({ summary: '블록 목록 조회 (상태별 필터 가능)' })
  @Get()
  async findAll(@Query() query: BlockRecordQueryDto) {
    return this.blockService.findAll(query);
  }

  /** 특정 블록 번호에 해당하는 블록 레코드를 조회합니다. 없으면 404를 반환합니다. */
  @ApiOperation({ summary: '특정 블록 번호 조회' })
  @ApiParam({ name: 'blockNumber', type: Number })
  @Get(':blockNumber')
  async findOne(@Param('blockNumber', ParseIntPipe) blockNumber: number) {
    return this.blockService.findOne(blockNumber);
  }
}
