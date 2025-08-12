// routes/compare/oneLine.js
const express = require("express");
const router = express.Router();
const db = require("../../models/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const makePrompt = require("../../prompts/oneLine");
const { authenticateToken } = require("../../middleware/auth");
require("dotenv").config();

// ✅ GET: 무작위 뉴스 (성능 개선 버전)
router.get("/", async (req, res) => {
  try {
    // 1. 전체 뉴스 기사 수를 먼저 효율적으로 계산합니다.
    const [[{ count }]] = await db.query("SELECT COUNT(*) as count FROM news");

    if (count === 0) {
      return res.status(404).json({ error: "뉴스가 없습니다." });
    }

    // 2. 0부터 (전체 수 - 1) 사이의 무작위 오프셋을 생성합니다.
    const randomOffset = Math.floor(Math.random() * count);

    // 3. 해당 오프셋의 뉴스 기사 1개를 즉시 가져옵니다. (ORDER BY RAND() 대신 사용)
    const [rows] = await db.query(
      "SELECT id, title, content FROM news LIMIT 1 OFFSET ?",
      [randomOffset]
    );

    const news = rows[0];
    if (!news) {
        // 이 경우는 거의 발생하지 않지만, 만약을 대비한 방어 코드입니다.
        return res.status(404).json({ error: "뉴스를 찾을 수 없습니다." });
    }

    res.json({ id: news.id, title: news.title, content: news.content });
  } catch (error) {
    console.error("뉴스 불러오기 실패:", error);
    res.status(500).json({ error: "뉴스 불러오는 중 오류 발생" });
  }
});

// ✅ POST: AI와 비교 및 점수 저장
router.post("/submit", authenticateToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    const { newsId, userSummary } = req.body;
    
    // 입력 검증
    if (!newsId || !userSummary) {
      return res.status(400).json({ 
        error: "newsId와 userSummary는 필수입니다.",
        code: "MISSING_REQUIRED_FIELDS"
      });
    }

    if (typeof userSummary !== 'string' || userSummary.trim().length === 0) {
      return res.status(400).json({ 
        error: "userSummary는 비어있지 않은 문자열이어야 합니다.",
        code: "INVALID_USER_SUMMARY"
      });
    }

    // 뉴스 조회
    const [newsRows] = await db.query("SELECT * FROM news WHERE id = ?", [newsId]);
    const news = newsRows[0];
    
    if (!news) {
      return res.status(404).json({ 
        error: "해당 뉴스가 없습니다.",
        code: "NEWS_NOT_FOUND"
      });
    }

    // AI 요약 생성
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = makePrompt({ title: news.title, content: news.content, userSummary: userSummary.trim() });

    const result = await model.generateContent(prompt);
    const response = result.response;
    
    if (!response) {
      throw new Error("AI 응답을 받을 수 없습니다.");
    }

    const aiSummary = (await response.text()).trim();
    
    if (!aiSummary) {
      throw new Error("AI가 빈 응답을 반환했습니다.");
    }

    // 점수 계산
    const score = compareSummaries(aiSummary, userSummary.trim());
    const feedback =
      score >= 80
        ? "훌륭해요! 핵심 내용을 잘 요약했어요."
        : score >= 50
        ? "나쁘지 않지만, 더 핵심 문장을 잡아보세요."
        : "AI 요약과 차이가 커요. 다시 도전해보세요!";

    // 점수 업데이트
    const [scoreRows] = await db.query("SELECT * FROM uscore WHERE uid = ?", [userId]);
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

    res.json({ 
      aiSummary, 
      userSummary: userSummary.trim(), 
      score, 
      feedback,
      success: true
    });

  } catch (error) {
    console.error("요약 비교 및 점수 저장 실패:", error);
    
    // Google API 에러 처리
    if (error.message?.includes('API key')) {
      return res.status(500).json({ 
        error: "AI 서비스 인증 오류입니다.",
        code: "AI_AUTH_ERROR"
      });
    }
    
    if (error.message?.includes('quota') || error.message?.includes('limit')) {
      return res.status(429).json({ 
        error: "AI 서비스 사용량 한도에 도달했습니다.",
        code: "AI_QUOTA_EXCEEDED"
      });
    }

    res.status(500).json({ 
      error: "처리 중 오류가 발생했습니다.",
      code: "INTERNAL_ERROR",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ 간단한 유사도 비교
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