/**
 * 프로덕션 환경 콘솔 로그 비활성화
 * 이 파일은 다른 모든 스크립트보다 먼저 로드되어야 합니다.
 */
(function () {
    const isLocal = window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1'
        || window.location.hostname.includes('192.168.');

    if (!isLocal) {
        // 프로덕션에서 콘솔 메서드 비활성화
        console.log = () => { };
        console.debug = () => { };
        console.info = () => { };
        console.warn = () => { };
        // console.error는 유지 (실제 오류 추적용)
    }
})();
