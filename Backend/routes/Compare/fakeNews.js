const express = require("express");
const router = express.Router();
const fakeNewsPrompt = require("../../prompts/fakeNews");
const db = require("../../models/db"); // DB 연결 모듈

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// 정답 인덱스 저장용
let lastAnswerIndex = null;

router.get("/", async (req, res) => {
  try {
    // 1. 뉴스 DB에서 랜덤 뉴스 1개 가져오기
    const [rows] = await db.query(
      `SELECT content FROM news ORDER BY RAND() LIMIT 1`
    );
    const realNews = rows[0]?.content;

    if (!realNews) return res.status(404).json({ error: "뉴스가 없습니다." });

    // 2. 프롬프트 생성 및 Gemini 호출
    const prompt = fakeNewsPrompt(realNews);
    const result = await model.generateContent(prompt);
    const response = result.response; // 전체 응답 객체 가져오기

    const responseText = response.text();

    // API 응답이 비어있는 경우 확인
    if (!responseText) {
      console.error("[FakeNews Error] Gemini API returned an empty or blocked response.", response);
      return res.status(500).json({ error: "API에서 비어있거나 차단된 응답을 반환했습니다.", details: response });
    }

    // 3. 응답 파싱 (프롬프트에서 JSON 형태로 오도록 구성됨)
    // Gemini 응답에서 마크다운 코드 블록 제거
    const cleanedResponse = responseText.replace(/```json\n|```/g, "").trim();
    const json = JSON.parse(cleanedResponse);
    lastAnswerIndex = json.answerIndex;

    res.json(json);
  } catch (err) {
    console.error("[FakeNews Error]", err);
    res.status(500).json({ error: "서버 오류" });
  }
});

router.post("/submit", (req, res) => {
  const { selectedIndex } = req.body;

  if (lastAnswerIndex === null)
    return res.status(400).json({ error: "이전 문제 정보가 없습니다." });

  const isCorrect = selectedIndex === lastAnswerIndex;
  res.json({ correct: isCorrect });
});

module.exports = router;
