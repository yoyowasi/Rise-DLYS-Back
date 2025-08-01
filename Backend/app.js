// 📁 app.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const db = require("./models/db");
require("dotenv").config();

const app = express();

// ✅ 미들웨어 등록
app.use(cors());
app.use(bodyParser.json());

// ✅ 라우터 등록
app.use("/api/auth", authRoutes);

// ✅ 테스트용 루트 경로
app.get("/", (req, res) => {
  res.send("✅ 백엔드 서버 작동 중 (from app.js)");
});

// ✅ 뉴스 API 예시 (DB 연결 확인용)
app.get("/api/news", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM news ORDER BY published_at DESC LIMIT 20"
    );
    res.json(rows);
  } catch (error) {
    console.error("[DB 오류]", error);
    res.status(500).send("뉴스를 불러오는 중 오류 발생");
  }
});

// ✅ 앱 객체를 외부로 내보냄 (server.js에서 실행)
module.exports = app;
