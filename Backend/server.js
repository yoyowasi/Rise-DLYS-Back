const express = require("express");
const cors = require("cors");
const pool = require("./model/db");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("백엔드 서버가 정상 작동 중입니다!");
});

// 뉴스 목록 조회 API
app.get("/news", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM news ORDER BY published_at DESC LIMIT 20"
    );
    res.json(rows);
  } catch (error) {
    console.error("[DB 오류]", error);
    res.status(500).send("뉴스를 불러오는 중 오류 발생");
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ 백엔드 서버 실행됨: http://localhost:${PORT}`);
});
