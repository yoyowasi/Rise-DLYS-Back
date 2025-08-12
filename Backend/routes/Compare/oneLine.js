const express = require("express");
const router = express.Router();
const db = require("../../models/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const makePrompt = require("../../prompts/oneLine");
const jwt = require("jsonwebtoken"); // ‼️ JWT 모듈 추가
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret";

// ‼️ JWT 토큰을 검증하는 미들웨어 (auth.js에서 가져옴)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    // 이제 '로그인이 필요합니다' 대신 '토큰이 없습니다'로 더 명확하게 응답
    return res.status(401).json({ message: "인증 토큰이 누락되었습니다." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "유효하지 않은 토큰입니다." });
    }
    // req.user에 토큰 정보를 저장합니다. (auth.js와 동일)
    req.user = user;
    next();
  });
};


// ✅ GET: 무작위 뉴스 (변경 없음)
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM news ORDER BY RAND() LIMIT 1");
    const news = rows[0];
    if (!news) return res.status(404).json({ error: "뉴스가 없습니다." });
    res.json({ id: news.id, title: news.title, content: news.content });
  } catch (error) {
    console.error("뉴스 불러오기 실패:", error);
    res.status(500).json({ error: "뉴스 불러오는 중 오류 발생" });
  }
});

// ✅ POST: AI와 비교 및 점수 저장 (JWT 인증 적용)
router.post("/submit", authenticateToken, async (req, res) => { // ‼️ 미들웨어 추가
  // ‼️ req.session 대신 req.user에서 사용자 ID를 가져옴
  const userId = req.user.uid; 

  const { newsId, userSummary } = req.body;
  if (!newsId || !userSummary)
    return res
      .status(400)
      .json({ error: "newsId와 userSummary는 필수입니다." });

  try {
    const [newsRows] = await db.query("SELECT * FROM news WHERE id = ?", [
      newsId,
    ]);
    const news = newsRows[0];
    if (!news) return res.status(404).json({ error: "해당 뉴스가 없습니다." });

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = makePrompt({ title: news.title, content: news.content });
    const result = await model.generateContent(prompt);
    const aiSummary = (await result.response.text()).trim();
    const score = compareSummaries(aiSummary, userSummary);
    const feedback =
      score >= 80
        ? "훌륭해요! 핵심 내용을 잘 요약했어요."
        : score >= 50
        ? "나쁘지 않지만, 더 핵심 문장을 잡아보세요."
        : "AI 요약과 차이가 커요. 다시 도전해보세요!";

    const [scoreRows] = await db.query(
      "SELECT * FROM uscore WHERE uid = ?",
      [userId]
    );
    const userScore = scoreRows[0];
    if (userScore) {
      const newTotalScore = userScore.total_score + score;
      const newGamesPlayed = userScore.games_played + 1;
      const newAccuracy = newTotalScore / newGamesPlayed;
      await db.query(
        "UPDATE uscore SET total_score = ?, games_played = ?, accuracy = ? WHERE uid = ?",
        [newTotalScore, newGamesPlayed, newAccuracy, userId]
      );
    } else {
      await db.query(
        "INSERT INTO uscore (uid, total_score, games_played, accuracy) VALUES (?, ?, ?, ?)",
        [userId, score, 1, score]
      );
    }
    res.json({ aiSummary, userSummary, score, feedback });
  } catch (error) {
    console.error("요약 비교 및 점수 저장 실패:", error);
    res.status(500).json({ error: "처리 중 오류가 발생했습니다." });
  }
});

// ✅ 간단한 유사도 비교 (변경 없음)
function compareSummaries(ai, user) {
  if (!ai || !user) return 0;
  const aiWords = ai.toLowerCase().split(/\s+/);
  const userWords = user.toLowerCase().split(/\s+/);
  const aiSet = new Set(aiWords);
  const userSet = new Set(userWords);
  const common = [...aiSet].filter((w) => userSet.has(w));
  return Math.round((common.length / aiSet.size) * 100);
}

module.exports = router;