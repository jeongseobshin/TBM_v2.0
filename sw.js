/* TBM 통합관리 시스템 · 서비스워커 (PWA 설치 지원 · 네트워크 우선)
   - 항상 최신 데이터를 받도록 네트워크 우선으로 동작합니다.
   - 별도 캐시를 두지 않아 배포 즉시 반영됩니다. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* 기본 네트워크 동작 사용 */ });
