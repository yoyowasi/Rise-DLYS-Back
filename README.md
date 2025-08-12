# Rise-DLYS Backend

뉴스 문해력 향상을 위한 AI 기반 교육 플랫폼 백엔드

## 설치 및 실행

### 의존성 설치
```bash
# 루트와 Backend 폴더 모든 의존성 설치
npm run install-all

# 또는 개별 설치
npm install
cd Backend && npm install
```

### 환경 변수 설정
Backend/.env 파일에 다음 환경 변수들이 설정되어 있어야 합니다:
- DB_HOST: 데이터베이스 호스트
- DB_USER: 데이터베이스 사용자명
- DB_PASSWORD: 데이터베이스 비밀번호
- DB_NAME: 데이터베이스 이름
- GOOGLE_API_KEY: Google Gemini API 키
- JWT_SECRET: JWT 토큰 비밀키
- SESSION_SECRET: 세션 비밀키

### 서버 실행
```bash
# 프로덕션 모드
npm start

# 개발 모드 (nodemon 사용)
npm run dev
```

## 주요 기능

- 사용자 인증 (회원가입/로그인)
- 뉴스 한 줄 요약 게임
- 가짜뉴스 판별 게임
- 편향 탐지 게임
- 사용자 랭킹 시스템
- JWT 기반 인증

## API 엔드포인트

- `/api/auth/*` - 인증 관련
- `/api/users/*` - 사용자 관리
- `/api/compare-random/*` - 한 줄 요약 게임
- `/api/fake-news/*` - 가짜뉴스 판별 게임
- `/api/compare-biasDetect/*` - 편향 탐지 게임

## 기술 스택

- Node.js + Express.js
- MySQL2
- JWT (jsonwebtoken)
- bcrypt
- Google Generative AI (Gemini)
- CORS
- express-session
