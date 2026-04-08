import { DataSource, EntityManager, EntityTarget, Repository } from 'typeorm';

/**
 * 모든 Repository가 공통으로 상속받는 기반 클래스.
 * TypeORM 트랜잭션 연동을 위해 EntityManager를 선택적으로 주입받을 수 있도록 지원합니다.
 */
export abstract class BaseRepository {
  constructor(protected readonly dataSource: DataSource) {}

  /**
   * EntityManager가 전달되면 트랜잭션 컨텍스트 내의 Repository를 반환하고,
   * 없으면 DataSource에서 기본 Repository를 반환합니다.
   * → 동일 트랜잭션 안에서 여러 Repository를 함께 사용할 때 이 메서드를 통해 일관성을 보장합니다.
   */
  protected getRepository<T>(
    entity: EntityTarget<T>,
    entityManager?: EntityManager,
  ): Repository<T> {
    return entityManager
      ? entityManager.getRepository(entity)
      : this.dataSource.getRepository(entity);
  }
}
