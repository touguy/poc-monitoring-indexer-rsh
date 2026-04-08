# 구현 계획: FINALIZED 블록 업데이트 보호

이미 `FINALIZED` 상태가 된 블록은 체인에서 확정된 상태이므로, 어떠한 경우에도 상태가 변경되거나(예: SAFE로 강등) 데이터가 덮어씌워져서는 안 됩니다. 이를 위해 DB 업데이트 쿼리에 보호 조건을 추가합니다.

## 제안된 변경 사항

### [Block Component]

#### [MODIFY] [block-record.repository.ts](file:///home/touguy/dev/poc-monitoring-indexer-rsh/src/block/repository/block-record.repository.ts)
- `updateStatusUpToBlock` 메서드에서 `status`를 업데이트할 때, 현재 상태가 `FINALIZED`인 레코드는 제외하도록 `AND status != 'FINALIZED'` 조건을 추가합니다.

```typescript
  async updateStatusUpToBlock(blockNumber: number, status: BlockStatus, entityManager?: EntityManager): Promise<void> {
    const repo = this.getRepository(BlockRecord, entityManager);
    await repo.createQueryBuilder()
      .update(BlockRecord)
      .set({ status })
      .where('block_number <= :blockNumber', { blockNumber })
      // 이미 동일 상태인 경우는 건너뜀
      .andWhere('status != :status', { status })
      // [추가] 이미 FINALIZED된 블록은 절대 변경하지 않음 (불변성 보장)
      .andWhere('status != :finalized', { finalized: BlockStatus.FINALIZED })
      .execute();
  }
```

## 검증 계획

### 수동 검증
- `safe` 블록 번호가 `finalized` 블록 번호보다 낮게 보고되는 특수한 상황(노드 동기화 지연 등)이 발생하더라도, 이미 확정된 블록들이 다시 `SAFE`로 업데이트되지 않는지 쿼리 로그를 통해 확인합니다.

### 자동 테스트
- `npm run lint` 를 실행하여 구문 오류가 없는지 확인합니다.
