// routes/compare/oneLine.js
const express = require("express");
const router = express.Router();
const db = require("../../models/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const makeComparisonPrompt = require("../../prompts/oneLine");
const makeProblemPrompt = require("../../prompts/problemSummary"); // 문제 생성용 프롬프트 추가
const { authenticateToken } = require("../../middleware/auth");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// AI 응답 파싱 헬퍼 함수 (비교 결과용)
const parseComparisonResponse = (text) => {
  try {
    const cleanedText = text
      .replace(/---/g, "")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const getSection = (key) => {
      const regex = new RegExp(`\\[${key}\\]([\\s\\S]*?)(?=\\[|$)`, "i");
      const match = cleanedText.match(regex);
      return match ? match[1].trim() : "";
    };

    const aiSummary = getSection("AI 한 줄 요약");
    const comparisonBlock = getSection("비교 결과");

    const getComparisonDetail = (key) => {
      if (!comparisonBlock) return "분석 실패";
      const regex = new RegExp(`- ${key}:\\s*(.*)`, "i");
      const match = comparisonBlock.match(regex);
      return match ? match[1].trim() : "분석 실패";
    };

    const scoreText = getComparisonDetail("점수");
    const score = parseInt(scoreText, 10) || 0;

    return {
      aiSummary,
      similarity: getComparisonDetail("유사도"),
      score,
      difference: getComparisonDetail("차이점"),
      suggestion: getComparisonDetail("제안"),
    };
  } catch (err) {
    console.error("AI 응답 파싱 실패:", err);
    return {
      aiSummary: "",
      similarity: "분석 실패",
      score: 0,
      difference: "분석 실패",
      suggestion: "분석 실패",
    };
  }
};

// 재시도 로직 헬퍼 함수
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function generateContentWithRetry(prompt, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      if (!result || !result.response) {
        throw new Error("AI_NO_RESPONSE_IN_RESULT");
      }
      return result;
    } catch (err) {
      lastError = err;
      console.error(`[Gemini API] Attempt ${attempt} failed:`, err.message);
      if (err.status === 503 && attempt < maxRetries) {
        await delay(1000 * attempt);
      } else {
        break;
      }
    }
  }
  throw lastError;
}

// GET /: AI가 요약한 '문제'를 생성해서 내려주는 API
router.get("/", async (req, res) => {
  try {
    const [[{ count }]] = await db.query(
      "SELECT COUNT(*) as count FROM news"
    );
    if (count === 0)
      return res.status(404).json({ error: "뉴스가 없습니다." });

    const randomOffset = Math.floor(Math.random() * count);
    const [rows] = await db.query(
      "SELECT id, title, content FROM news LIMIT 1 OFFSET ?",
      [randomOffset]
    );
    const originalNews = rows[0];
    if (!originalNews)
      return res.status(404).json({ error: "뉴스를 찾을 수 없습니다." });

    const problemPrompt = makeProblemPrompt({
      title: originalNews.title,
      content: originalNews.content,
    });
    const result = await generateContentWithRetry(problemPrompt);
    const summarizedContent = (await result.response.text()).trim();

    if (!summarizedContent) {
      return res
        .status(502)
        .json({ error: "AI가 문제 요약 생성에 실패했습니다." });
    }

    res.json({
      id: originalNews.id,
      title: originalNews.title,
      content: summarizedContent,
    });
  } catch (error) {
    console.error("문제 생성 실패:", error);
    res.status(500).json({ error: "문제 생성 중 오류 발생" });
  }
});

// POST /submit: 사용자의 답안을 채점하는 API
router.post("/submit", authenticateToken, async (req, res) => {
  const userId = req.user.uid;
  try {
    const { newsId, userSummary } = req.body;
    if (!newsId || !userSummary)
      return res
        .status(400)
        .json({ error: "newsId와 userSummary는 필수입니다." });

    const [newsRows] = await db.query(
      "SELECT * FROM news WHERE id = ?",
      [newsId]
    );
    const originalNews = newsRows[0];
    if (!originalNews)
      return res.status(404).json({ error: "해당 뉴스가 없습니다." });

    const comparisonPrompt = makeComparisonPrompt({
      title: originalNews.title,
      content: originalNews.content,
      userSummary,
    });

    const result = await generateContentWithRetry(comparisonPrompt);
    const aiResponseText = (await result.response.text()).trim();
    if (!aiResponseText)
      throw new Error("AI가 빈 응답을 반환했습니다.");

    const parsedData = parseComparisonResponse(aiResponseText);
    const { score } = parsedData;

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

    res.json({ userSummary, ...parsedData, success: true });
  } catch (error) {
    console.error("요약 비교 및 점수 저장 실패:", error);
    if (error && error.status === 503) {
      return res.status(503).json({
        error: "AI 서비스가 현재 응답할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        code: "AI_SERVICE_UNAVAILABLE",
      });
    }
    res.status(500).json({ error: "처리 중 오류가 발생했습니다." });
  }
});

module.exports = router;
