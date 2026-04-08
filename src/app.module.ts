import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import { BlockchainModule } from './blockchain/blockchain.module';
import { getWinstonOptions } from './common/config/winston.config';
import { BaseEntity } from './common/entities/base.entity';
import { GlobalExceptionsFilter } from './common/filters/global-exceptions.filter';
import { GlobalResponseInterceptor } from './common/interceptors/global-response.interceptor';
import { BlockModule } from './block/block.module';
import { ReorgModule } from './reorg/reorg.module';
import { BlockRecord } from './block/entity/block-record.entity';
import { ReorgLog } from './reorg/entity/reorg-log.entity';

/**
 * 애플리케이션의 루트 모듈.
 * 전체 시스템에서 사용하는 전역 설정(환경 변수, DB, 로깅, 스케줄링)과
 * 각 도메인 모듈(Blockchain, TransferEvent, Block, Reorg)을 통합합니다.
 */
@Module({
  imports: [
    // 환경 변수 설정 (.env 파일 로드)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Winston 로거 설정 (전역 로깅)
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getWinstonOptions,
    }),
    // PostgreSQL 및 TypeORM 설정
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'indexer'),
        entities: [BaseEntity, BlockRecord, ReorgLog],
        synchronize: false, // 보안 및 정합성을 위해 init.sql을 통한 수동 관리 권장
        logging: process.env.NODE_ENV !== 'production',
      }),
    }),
    // 크론잡 및 스케줄링 기능 활성화
    ScheduleModule.forRoot(),
    // 도메인 기능 모듈
    BlockchainModule,
    BlockModule,
    ReorgModule,
  ],
  controllers: [],
  providers: [
    // 모든 컨트롤러 응답을 ResultResDto 형식으로 감싸는 전역 인터셉터
    {
      provide: APP_INTERCEPTOR,
      useClass: GlobalResponseInterceptor,
    },
    // 모든 예외를 비즈니스 규격에 맞게 처리하는 전역 예외 필터
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionsFilter,
    },
  ],
})
export class AppModule {}
