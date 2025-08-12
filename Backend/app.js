const express = require("express");
const cors = require("cors");
const session = require("express-session"); // express-session 모듈 불러오기
const authRoutes = require("./routes/auth");
const oneLineRoutes = require("./routes/Compare/oneLine");
const biasRoutes = require("./routes/Compare/biasDetect");
const fakeNewsRoutes = require("./routes/Compare/fakeNews");
const userRoutes = require("./routes/userController");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

require("dotenv").config();

const app = express();

// CORS 옵션 설정
const corsOptions = {
  origin: "http://localhost:3000", // 허용할 프론트엔드 출처
  credentials: true, // 쿠키 등 인증 정보 허용
};

// CORS 미들웨어 적용
app.use(cors(corsOptions));

// 세션 미들웨어 설정 (CORS 설정 바로 아래에 추가)
app.use(
  session({
    secret: process.env.SESSION_SECRET, // .env 파일의 비밀 키를 사용
    resave: false, // 세션이 변경되지 않아도 항상 다시 저장할지 여부
    saveUninitialized: false, // 초기화되지 않은 세션을 저장소에 저장할지 여부
    cookie: {
      httpOnly: true, // 클라이언트 JavaScript에서 쿠키에 접근 불가
      secure: false, // 개발 환경에서는 http 통신을 위해 false로 설정
    },
  })
);

// Express 내장 JSON 파서 사용 (Express 4.16.0+)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우터 설정
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/compare-random", oneLineRoutes);
app.use("/api/compare-biasDetect", biasRoutes);
app.use("/api/fake-news", fakeNewsRoutes);

// 루트 경로 핸들러
app.get("/", (req, res) => {
  res.send("✅ 백엔드 서버 작동 중 (from app.js)");
});

// 404 에러 핸들러 (모든 라우트 다음에 위치)
app.use(notFoundHandler);

// 전역 에러 핸들러 (가장 마지막에 위치)
app.use(errorHandler);

module.exports = app;