# WebSocket 블록 이벤트 순차 처리(Queue) 도입 계획

## 목표

현재 `BlockService`에서 WebSocket으로 수신하는 `block` 이벤트가 지연 없이 바로 처리되면서, 동시에 여러 이벤트가 유입될 경우 트랜잭션 충돌이나 데이터 적재 순서가 뒤섞이는 동시성 문제가 발생할 우려가 있습니다.
이를 방지하기 위해 **메모리 기반의 큐(Queue)와 워커(Worker) 루프를 도입하여 이벤트 수신과 DB 적재 처리를 분리하고, 순차적(Sequential) 적재를 보장**하는 안정적인 구조로 변경합니다.

## 변경 계획

### 1. 큐 및 워커 플래그 상태 변수 선언
NodeJS의 단일 스레드와 비동기(`async/await`) 루프를 활용하여 큐의 무결성을 유지하면서 백그라운드 프로세싱(유사 멀티스레드 느낌)을 구현합니다.

- `private blockQueue: number[] = [];` : 들어온 블록 번호를 차례대로 쌓아두는 큐.
- `private isProcessingQueue: boolean = false;` : 큐를 현재 처리하고 있는지 여부를 나타내는 플래그. 여러 워커가 동시에 큐에서 항목을 가져가는 것을 방지합니다.

### 2. WebSocket 이벤트 구독 로직 변경 (`onModuleInit`)
이벤트가 들어왔을 때 즉시 `await this.handleNewBlock(blockNumber)`를 호출하지 않습니다.
대신 큐에 항목을 추가하고 프로세스를 깨우는 역할만 합니다.

```typescript
this.wsService.onEvent('block', (...args: any[]) => {
  const blockNumber = args[0] as number;
  this.blockQueue.push(blockNumber); // 메모리 큐에 적재
  this.processBlockQueue(); // 워커 실행 요청 (비동기)
});
```

### 3. Queue 비동기 워커 로직 추가 (`processBlockQueue`)
`processBlockQueue()`는 큐에 남은 항목이 없을 때까지 하나씩 순차적으로 가져와 `handleNewBlock`을 처리합니다.

```typescript
private async processBlockQueue() {
  // 이미 다른 비동기 루프가 큐를 처리 중이라면 리턴 (순차 보장)
  if (this.isProcessingQueue) return;
  this.isProcessingQueue = true;

  try {
    // 큐에 항목이 존재하는 한 계속해서 처리
    while (this.blockQueue.length > 0) {
      const blockNumber = this.blockQueue.shift();
      if (blockNumber) {
        await this.handleNewBlock(blockNumber);
      }
    }
  } finally {
    // 큐가 완전히 비워지면 플래그 해제
    this.isProcessingQueue = false;
  }
}
```

---

## 작업할 구성요소 및 파일

### BlockService

#### [MODIFY] [block.service.ts](file:///home/touguy/dev/poc-monitoring-indexer-rsh/src/block/service/block.service.ts)
- `blockQueue`, `isProcessingQueue` 클래스 멤버 변수 추가.
- `onModuleInit` 내의 `wsService.onEvent('block', ...)` 핸들러 로직 수정.
- `processBlockQueue()` 프라이빗 메서드 추가.

## 사용자 검토 필요 사항 (User Review Required)

> [!IMPORTANT]
> - **메시지 소실 가능성 (인메모리 특성):** 제안드린 메모리 큐 방식은 레디스(Redis) 같은 외부 큐를 두지 않는 매우 가볍고 직관적인 방식입니다. 단, 애플리케이션이 강제 종료되거나 배포 재시작이 발생할 때 메모리에 남아있던(대기 중이던) 큐 내부 데이터는 소멸됩니다. 하지만 저희 서비스에는 주기적으로 블록 Gap을 체크하고 메우는 [초기/폴링 동기화] 기능이 존재하므로 이 부분이 문제 되지 않을 것으로 판단되었습니다.
> - **위 계획대로 코드 수정을 진행해도 괜찮을까요?** 계획을 확인하시고 승인해 주시면 즉시 코드 작업을 시작하겠습니다.
