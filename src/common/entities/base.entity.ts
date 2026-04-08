import {
  BaseEntity as TypeOrmBaseEntity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 모든 엔티티가 공통으로 상속받는 기반 엔티티.
 * 소프트 삭제 플래그(del_yn)와 등록/수정 시각을 자동으로 관리합니다.
 */
export abstract class BaseEntity extends TypeOrmBaseEntity {
  /** 소프트 삭제 여부 ('N' = 정상, 'Y' = 삭제됨) */
  @Column({ name: 'del_yn', type: 'varchar', length: 1, default: 'N' })
  delYn: string;

  /** 레코드 최초 등록 시각 (INSERT 시 자동 설정) */
  @CreateDateColumn({ name: 'sys_reg_dtm', type: 'timestamp' })
  sysRegDtm: Date;

  /** 레코드 마지막 수정 시각 (UPDATE 시 자동 갱신) */
  @UpdateDateColumn({ name: 'sys_upd_dtm', type: 'timestamp' })
  sysUpdDtm: Date;
}
