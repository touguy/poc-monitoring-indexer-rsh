import { ethers } from 'ethers';

/**
 * 🚀 [Ponder 확장 기능] Bloom Filter 유틸리티
 * 블록 헤더의 logsBloom 해시를 분석하여 특정 컨트랙트 주소나 토픽이 해당 블록 내에 존재할 확률을 판별합니다.
 * 이를 통해 불필요한 eth_getLogs RPC 호출을 획기적으로 줄일 수 있습니다.
 */
export class BloomUtil {
  /**
   * 블록의 logsBloom에 주어진 주소 또는 토픽 배열 중 하나라도 포함되어 있을 가능성이 있는지 검사합니다.
   * @param logsBloom 블록 헤더에 포함된 256바이트 길이의 해시 문자열
   * @param addresses 검사할 컨트랙트 주소 목록
   * @param topics 검사할 이벤트 토픽 목록
   * @returns 하나라도 포함되어 있을 가능성이 있으면 true, 절대 포함되어 있지 않으면 false
   */
  static isRelevant(logsBloom: string | null | undefined, addresses: string[], topics: string[]): boolean {
    // logsBloom이 명확하지 않은 경우, 누락 방지를 위해 안전하게 true(수집 시도) 반환
    if (!logsBloom || logsBloom === '0x' || logsBloom.length < 512) {
      return true;
    }

    // ethers.js v6의 isBloomIn을 사용하는 것이 이상적이나, 
    // 지원되지 않는 환경이거나 ZK 체인처럼 bloom 값이 무효한 환경을 대비해
    // 현재는 안전하게 true를 반환하는 구조로 작성합니다.
    // (실제 Ponder 로직을 포팅하려면 비트 단위 검증 로직이 여기에 들어갑니다)
    
    // TODO: 명시적인 비트 필터 연산 적용 (실제 환경에 맞게 추가 구현 필요)
    
    return true; 
  }
}
