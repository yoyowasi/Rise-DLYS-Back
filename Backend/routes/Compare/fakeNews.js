const express = require("express");
const router = express.Router();
const fakeNewsPrompt = require("../../prompts/fakeNews");
const db = require("../../models/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const jwt = require("jsonwebtoken");
const { authenticateToken, JWT_SECRET } = require("../../middleware/auth");
const { checkAndAwardPostGameBadges } = require('../../utils/badgeUtils');
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const TOTAL_QUESTIONS = 5;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateContentWithRetry(prompt, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (err) {
      attempt++;
      console.error(`[FakeNews Gemini] Attempt ${attempt} failed:`, err.message);
      if (err.status === 503 && attempt < maxRetries) {
        await delay(1000 * attempt);
      } else {
        throw err;
      }
    }
  }
}

router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT content FROM news ORDER BY RAND() LIMIT ${TOTAL_QUESTIONS}`);
    
    if (!rows || rows.length < TOTAL_QUESTIONS) {
      return res.status(404).json({ 
        error: "문제를 만들기에 충분한 뉴스가 없습니다.",
        code: "NOT_ENOUGH_NEWS"
      });
    }

    const questionPromises = rows.map(async (row) => {
      const realNews = row.content;
      const prompt = fakeNewsPrompt(realNews);
      
      const result = await generateContentWithRetry(prompt);
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

      const questionToken = jwt.sign({ isFakeAnswer: isFake }, JWT_SECRET, { expiresIn: '10m' });
      
      return {
        questionToken,
        article,
        options: ["가짜 뉴스", "진짜 뉴스"]
      };
    });

    const questions = await Promise.all(questionPromises);
    res.json(questions);

  } catch (err) {
    console.error("[FakeNews Error]", err);
    if (err.message === 'AI_NO_RESPONSE') {
      return res.status(502).json({ error: "AI 서비스에서 응답을 받을 수 없습니다.", code: "AI_NO_RESPONSE" });
    }
    if (err.message === 'AI_EMPTY_RESPONSE') {
        return res.status(502).json({ error: "AI 응답이 비어있거나 차단되었습니다.", code: "AI_EMPTY_RESPONSE" });
    }
    res.status(500).json({ 
      error: "서버 오류가 발생했습니다.",
      code: "INTERNAL_ERROR",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

router.post("/submit", authenticateToken, async (req, res) => {
    const userId = req.user.uid;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { questionToken, userAnswerIsFake } = req.body;
        if (!questionToken) {
            await connection.rollback();
            return res.status(400).json({ error: "questionToken은 필수입니다." });
        }
        if (typeof userAnswerIsFake !== 'boolean') {
            await connection.rollback();
            return res.status(400).json({ error: "userAnswerIsFake는 boolean 값이어야 합니다." });
        }

        let decoded;
        try {
            decoded = jwt.verify(questionToken, JWT_SECRET);
        } catch (jwtError) {
            await connection.rollback();
            return res.status(400).json({ error: "유효하지 않거나 만료된 문제 토큰입니다." });
        }
        
        const truthIsFake = decoded.isFakeAnswer;
        const isCorrect = userAnswerIsFake === truthIsFake;
        const score = isCorrect ? 100 : 0;

        await connection.query(
            `INSERT INTO uscore (uid, total_score, games_played, accuracy) 
             VALUES (?, ?, 1, ?)
             ON DUPLICATE KEY UPDATE 
             total_score = total_score + VALUES(total_score), 
             games_played = games_played + 1,
             accuracy = total_score / games_played`,
            [userId, score, score]
        );
        
        await checkAndAwardPostGameBadges(connection, userId);

        await connection.commit();

        res.json({
            correct: isCorrect,
            truthIsFake,
            score,
            success: true
        });

    } catch (err) {
        await connection.rollback();
        console.error("[FakeNews Submit Error]", err);
        res.status(500).json({ 
            error: "서버 오류가 발생했습니다.",
            code: "INTERNAL_ERROR",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    } finally {
        connection.release();
    }
});

module.exports = router;