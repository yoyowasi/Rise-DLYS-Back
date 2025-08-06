// routes/compare/oneLine.js
const express = require("express");
const router = express.Router();
const db = require("../../models/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const makePrompt = require("../../prompts/oneLine");
require("dotenv").config();

// ✅ GET: 무작위 뉴스
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

// ✅ POST: AI와 비교
router.post("/", async (req, res) => {
  const { newsId, userSummary } = req.body;
  if (!newsId || !userSummary)
    return res
      .status(400)
      .json({ error: "newsId와 userSummary는 필수입니다." });

  try {
    const [rows] = await db.query("SELECT * FROM news WHERE id = ?", [newsId]);
    const news = rows[0];
    if (!news) return res.status(404).json({ error: "해당 뉴스가 없습니다." });

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

    res.json({ aiSummary, userSummary, score, feedback });
  } catch (error) {
    console.error("요약 비교 실패:", error);
    res.status(500).json({ error: "요약 비교 중 오류 발생" });
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
