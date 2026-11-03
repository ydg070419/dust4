// Node.js 기본 내장 모듈 가져오기
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Vercel 서버리스 API 핸들러 가져오기
import handler from './api/dust.js';

// 현재 디렉토리 경로 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 파일에서 환경변수 로드
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        // 주석(#) 및 빈 줄 제외
        if (trimmed && !trimmed.startsWith('#')) {
            const separatorIndex = trimmed.indexOf('=');
            if (separatorIndex !== -1) {
                const key = trimmed.slice(0, separatorIndex).trim();
                const value = trimmed.slice(separatorIndex + 1).trim();
                process.env[key] = value;
            }
        }
    });
}

// 파일 확장자별 MIME 타입 정의
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

// 로컬 HTTP 개발 서버 생성
const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);

    // Vercel 서버리스 함수 라우팅 (/api/dust)
    if (parsedUrl.pathname === '/api/dust') {
        // 쿼리 파라미터 파싱 및 req.query 할당
        req.query = Object.fromEntries(parsedUrl.searchParams.entries());

        // Vercel res.status() 및 res.json() 메서드 헬퍼 제공
        res.status = (statusCode) => {
            res.statusCode = statusCode;
            return res;
        };
        res.json = (data) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(data));
        };

        try {
            // api/dust.js 핸들러 실행
            await handler(req, res);
        } catch (err) {
            console.error('API 처리 중 예외 발생:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // 정적 파일 경로 정리 (Windows / POSIX 호환)
    let pathname = decodeURIComponent(parsedUrl.pathname);
    if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
    }

    // 앞쪽 슬래시/역슬래시 제거하여 현재 디렉토리 기준 상대 경로로 변환
    const cleanRelativePath = pathname.replace(/^[/\\]+/, '');
    let filePath = path.join(__dirname, cleanRelativePath);

    // 디렉토리 접근 시 내부의 index.html 탐색
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    // 파일 존재 여부 최종 확인
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(`404 Not Found - 요청한 파일을 찾을 수 없습니다: ${pathname}`);
        return;
    }

    // MIME 타입 설정 후 파일 내용 브라우저로 전송
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
});

// 서버 실행 포트 설정 (3000번)
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`실시간 대기오염 앱 로컬 서버가 시작되었습니다.`);
    console.log(`브라우저 접속 주소: http://localhost:${PORT}`);
    console.log(`=========================================`);
});
