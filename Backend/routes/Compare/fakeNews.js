// routes/compare/fakeNews.js
const express = require("express");
const router = express.Router();
const fakeNewsPrompt = require("../../prompts/fakeNews");
const db = require("../../models/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const jwt = require("jsonwebtoken");
const { authenticateToken, JWT_SECRET } = require("../../middleware/auth");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// GET /: 가짜뉴스 문제 생성 (DB 조회 최적화 및 JWT 방식 적용)
router.get("/", async (req, res) => {
  try {
    // 1. 전체 뉴스 기사 수 계산 (성능 개선)
    const [[{ count }]] = await db.query("SELECT COUNT(*) as count FROM news");
    if (count === 0) {
      return res.status(404).json({ 
        error: "뉴스가 없습니다.",
        code: "NO_NEWS_AVAILABLE"
      });
    }

    // 2. 무작위 오프셋 생성 및 뉴스 1건 조회 (성능 개선)
    const randomOffset = Math.floor(Math.random() * count);
    const [rows] = await db.query("SELECT content FROM news LIMIT 1 OFFSET ?", [randomOffset]);
    const realNews = rows?.[0]?.content;
    
    if (!realNews) {
      return res.status(404).json({ 
        error: "뉴스를 찾을 수 없습니다.",
        code: "NEWS_NOT_FOUND"
      });
    }

    // 3. 프롬프트 생성 & Gemini 호출
    const prompt = fakeNewsPrompt(realNews);
    const result = await model.generateContent(prompt);
    const response = result?.response;
    
    if (!response) {
      console.error("[FakeNews Error] No response from Gemini API");
      return res.status(502).json({ 
        error: "AI 서비스에서 응답을 받을 수 없습니다.",
        code: "AI_NO_RESPONSE"
      });
    }

    const responseText = response?.text?.() || "";

    if (!responseText) {
      console.error("[FakeNews Error] Gemini API returned empty/blocked response.", response);
      return res.status(502).json({ 
        error: "AI 응답이 비어있거나 차단되었습니다.",
        code: "AI_EMPTY_RESPONSE"
      });
    }

    // 4. JSON 파싱
    const cleaned = responseText.replace(/```json\s*|\s*```/gi, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("[FakeNews Parse Error] raw:", responseText, "cleaned:", cleaned, "error:", parseError);
      return res.status(502).json({ 
        error: "AI 응답 파싱 실패",
        code: "AI_PARSE_ERROR"
      });
    }

    const article = String(parsed?.article || "").trim();
    const isFake = Boolean(parsed?.isFake);

    if (!article) {
      return res.status(502).json({ 
        error: "AI가 유효한 기사 텍스트를 생성하지 못했습니다.",
        code: "AI_INVALID_ARTICLE"
      });
    }

    // 5. 정답을 JWT에 담아 토큰으로 생성 (임시 저장소 대신 사용)
    const questionToken = jwt.sign({ isFakeAnswer: isFake }, JWT_SECRET, { expiresIn: '10m' });

    // 6. 클라이언트로 문제 전송
    res.json({
      questionToken,
      article,
      options: ["가짜 뉴스", "진짜 뉴스"], // 0: 가짜, 1: 진짜
      success: true
    });

  } catch (err) {
    console.error("[FakeNews Error]", err);
    
    // Google API 에러 처리
    if (err.message?.includes('API key')) {
      return res.status(500).json({ 
        error: "AI 서비스 인증 오류입니다.",
        code: "AI_AUTH_ERROR"
      });
    }
    
    if (err.message?.includes('quota') || err.message?.includes('limit')) {
      return res.status(429).json({ 
        error: "AI 서비스 사용량 한도에 도달했습니다.",
        code: "AI_QUOTA_EXCEEDED"
      });
    }

    res.status(500).json({ 
      error: "서버 오류가 발생했습니다.",
      code: "INTERNAL_ERROR",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /submit: 정답 제출 (점수 기록 기능 추가)
router.post("/submit", authenticateToken, async (req, res) => {
  try {
    const { questionToken, userAnswerIsFake } = req.body;
    const userId = req.user.uid;

    // 입력 검증
    if (!questionToken) {
      return res.status(400).json({ 
        error: "questionToken은 필수입니다.",
        code: "MISSING_QUESTION_TOKEN"
      });
    }

    if (typeof userAnswerIsFake !== 'boolean') {
      return res.status(400).json({ 
        error: "userAnswerIsFake는 boolean 값이어야 합니다.",
        code: "INVALID_ANSWER_TYPE"
      });
    }

    // JWT 토큰을 검증하여 정답 확인
    let decoded;
    try {
      decoded = jwt.verify(questionToken, JWT_SECRET);
    } catch (jwtError) {
      console.error("JWT 검증 실패:", jwtError);
      return res.status(400).json({ 
        error: "유효하지 않거나 만료된 문제 토큰입니다.",
        code: "INVALID_QUESTION_TOKEN"
      });
    }
    
    const truthIsFake = decoded.isFakeAnswer;
    const isCorrect = userAnswerIsFake === truthIsFake;
    const score = isCorrect ? 100 : 0;

    // 점수 업데이트 로직
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
      correct: isCorrect,
      truthIsFake,
      score,
      success: true
    });

  } catch (err) {
    console.error("[FakeNews Submit Error]", err);
    
    // 데이터베이스 에러 처리
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ 
        error: "사용자 점수 테이블을 찾을 수 없습니다.",
        code: "DB_TABLE_ERROR"
      });
    }

    res.status(500).json({ 
      error: "서버 오류가 발생했습니다.",
      code: "INTERNAL_ERROR",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;
