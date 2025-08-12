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
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const TOTAL_QUESTIONS = 5; // 한 게임에 생성할 문제 수를 상수로 정의

// 잠시 대기하는 함수
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// AI 모델 호출을 재시도 로직과 함께 래핑하는 함수
async function generateContentWithRetry(prompt, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const result = await model.generateContent(prompt);
      return result; // 성공 시 결과 반환
    } catch (err) {
      attempt++;
      console.error(`[FakeNews Gemini] Attempt ${attempt} failed:`, err.message);
      // 503 에러이고 아직 재시도 횟수가 남았을 때만 대기 후 재시도
      if (err.status === 503 && attempt < maxRetries) {
        await delay(1000 * attempt); // 1초, 2초 간격으로 대기
      } else {
        // 다른 종류의 에러이거나 모든 재시도 실패 시 에러 발생
        throw err;
      }
    }
  }
}


// GET /: 가짜뉴스 문제 생성 로직을 5개씩 만들도록 수정
router.get("/", async (req, res) => {
  try {
    // 1. DB에서 무작위 뉴스 5개 조회
    const [rows] = await db.query(`SELECT content FROM news ORDER BY RAND() LIMIT ${TOTAL_QUESTIONS}`);
    
    if (!rows || rows.length < TOTAL_QUESTIONS) {
      return res.status(404).json({ 
        error: "문제를 만들기에 충분한 뉴스가 없습니다.",
        code: "NOT_ENOUGH_NEWS"
      });
    }

    // 2. 5개의 뉴스에 대해 병렬로 AI 호출하여 문제 생성
    const questionPromises = rows.map(async (row) => {
      const realNews = row.content;
      const prompt = fakeNewsPrompt(realNews);
      
      const result = await generateContentWithRetry(prompt); // 재시도 로직이 포함된 함수 사용
      const response = result?.response;

      if (!response) {
        throw new Error("AI_NO_RESPONSE");
      }
      
      const responseText = response.text() || "";
      if (!responseText) {
        throw new Error("AI_EMPTY_RESPONSE");
      }
      
      const cleaned = responseText.replace(/```json\s*|\s*```/gi, "").trim();
      const parsed = JSON.parse(cleaned);
      
      const article = String(parsed?.article || "").trim();
      const isFake = Boolean(parsed?.isFake);

      if (!article) {
        throw new Error("AI_INVALID_ARTICLE");
      }

      // 각 문제에 대한 개별 토큰 생성
      const questionToken = jwt.sign({ isFakeAnswer: isFake }, JWT_SECRET, { expiresIn: '10m' });
      
      return {
        questionToken,
        article,
        options: ["가짜 뉴스", "진짜 뉴스"]
      };
    });

    // 모든 비동기 작업이 완료될 때까지 기다림
    const questions = await Promise.all(questionPromises);

    // 3. 클라이언트로 5개의 문제 세트 전송
    res.json(questions);

  } catch (err) {
    console.error("[FakeNews Error]", err);

    // 에러 코드에 따른 분기 처리
    if (err.message === 'AI_NO_RESPONSE') {
      return res.status(502).json({ error: "AI 서비스에서 응답을 받을 수 없습니다.", code: "AI_NO_RESPONSE" });
    }
    if (err.message === 'AI_EMPTY_RESPONSE') {
        return res.status(502).json({ error: "AI 응답이 비어있거나 차단되었습니다.", code: "AI_EMPTY_RESPONSE" });
    }
    // ... 기타 에러 처리
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