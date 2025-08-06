const express = require("express");
const router = express.Router();
const db = require("../../models/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const makeBiasPrompt = require("../../prompts/biasDetect");

require("dotenv").config();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// ✅ GET: 서로 다른 뉴스 2개 무작위 반환
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM news ORDER BY RAND() LIMIT 2");

    if (rows.length < 2) {
      return res.status(404).json({ error: "뉴스가 2개 이상 필요합니다." });
    }

    const [newsA, newsB] = rows;

    res.json({
      newsA: {
        id: newsA.id,
        title: newsA.title,
        content: newsA.content,
      },
      newsB: {
        id: newsB.id,
        title: newsB.title,
        content: newsB.content,
      },
    });
  } catch (error) {
    console.error("뉴스 2개 가져오기 실패:", error);
    res.status(500).json({ error: "뉴스 불러오는 중 오류 발생" });
  }
});

// ✅ POST: 유저 선택과 AI 판단 비교
router.post("/", async (req, res) => {
  const { newsAId, newsBId, userChoice } = req.body;

  if (!newsAId || !newsBId || !["A", "B"].includes(userChoice)) {
    return res
      .status(400)
      .json({ error: "newsAId, newsBId, userChoice는 필수입니다." });
  }

  try {
    const [rows] = await db.query("SELECT * FROM news WHERE id IN (?, ?)", [
      newsAId,
      newsBId,
    ]);

    if (rows.length < 2) {
      return res.status(404).json({ error: "뉴스가 존재하지 않습니다." });
    }

    const newsA = rows.find((n) => n.id === newsAId);
    const newsB = rows.find((n) => n.id === newsBId);

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = makeBiasPrompt(newsA, newsB);

    const result = await model.generateContent(prompt);
    const aiAnswer = (await result.response.text()).trim().toUpperCase();

    const isSame = aiAnswer === userChoice;
    const feedback = isSame
      ? "AI와 판단이 일치합니다! 균형감 있는 시각이에요."
      : "AI와 판단이 다릅니다. 다시 생각해보면 어떤가요?";

    res.json({
      aiAnswer,
      userChoice,
      isSame,
      feedback,
    });
  } catch (error) {
    console.error("편향 비교 실패:", error);
    res.status(500).json({ error: "편향 비교 중 오류 발생" });
  }
});

module.exports = router;
