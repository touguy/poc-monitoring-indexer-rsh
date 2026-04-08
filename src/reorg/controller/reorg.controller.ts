import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReorgLogQueryDto } from '../dto/reorg-log-query.dto';
import { ReorgService } from '../service/reorg.service';

/**
 * Chain Reorg 이력 조회 API 컨트롤러.
 * 시스템에서 감지된 모든 체인 재조직(Reorg) 로그를 조회합니다.
 */
@ApiTags('Reorg')
@Controller('reorgs')
export class ReorgController {
  constructor(private readonly reorgService: ReorgService) {}

  /**
   * 감지된 Reorg 로그 목록을 조회합니다.
   * 특정 블록 범위를 지정하여 필터링할 수 있습니다.
   */
  @ApiOperation({ summary: 'Reorg 발생 이력 조회' })
  @Get()
  async findAll(@Query() query: ReorgLogQueryDto) {
    return this.reorgService.findAll(query.fromBlock, query.toBlock);
  }
}
