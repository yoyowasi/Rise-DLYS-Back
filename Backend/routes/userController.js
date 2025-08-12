// userController.js
const express = require("express");
const db = require("../models/db");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
require("dotenv").config();

// 사용자 프로필 업데이트 라우터
router.put("/profile", authenticateToken, async (req, res) => {
  const {
    username,
    school,
    location,
    grade,
    total_score,
    games_played,
    accuracy,
  } = req.body;
  const { uid } = req.user;

  if (!username || !school || !location || !grade) {
    return res.status(400).json({ message: "모든 항목을 입력해주세요." });
  }

  const parsedGrade = parseInt(grade, 10);
  if (isNaN(parsedGrade) || parsedGrade < 1 || parsedGrade > 6) {
    return res
      .status(400)
      .json({ message: "학년은 1부터 6 사이의 숫자여야 합니다." });
  }

  try {
    await db.execute(
      "UPDATE users SET name = ?, school = ?, location = ?, grade = ? WHERE uid = ?",
      [username, school, location, parsedGrade, uid]
    );

    if (
      total_score !== undefined ||
      games_played !== undefined ||
      accuracy !== undefined
    ) {
      await db.execute(
        "UPDATE uscore SET total_score = ?, games_played = ?, accuracy = ? WHERE uid = ?",
        [total_score, games_played, accuracy, uid]
      );
    }

    res
      .status(200)
      .json({ message: "프로필이 성공적으로 업데이트되었습니다." });
  } catch (error) {
    console.error("프로필 업데이트 오류:", error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

// 사용자 프로필 정보와 랭킹 정보 조회 라우터
router.get("/profile", authenticateToken, async (req, res) => {
  const { uid } = req.user;

  try {
    const [userRows] = await db.execute(
      `
      SELECT
        u.name AS username,
        u.email,
        u.school,
        u.grade,
        u.location,
        u.created_at AS joinDate,
        us.total_score,
        us.games_played AS gamesPlayed,
        us.accuracy
      FROM users u
      LEFT JOIN uscore us ON u.uid = us.uid
      WHERE u.uid = ?
      `,
      [uid]
    );

    if (userRows.length === 0) {
      return res
        .status(404)
        .json({ message: "사용자 정보를 찾을 수 없습니다." });
    }

    const userData = userRows[0];

    const [rankingData] = await db.execute(
      `
      SELECT
        u.name AS username,
        u.school,
        us.total_score
      FROM users u
      LEFT JOIN uscore us ON u.uid = us.uid -- ‼️ JOIN을 LEFT JOIN으로 수정
      ORDER BY us.total_score DESC, us.games_played DESC
      `
    );

    res.status(200).json({
      profile: {
        username: userData.username,
        email: userData.email,
        school: userData.school,
        grade: userData.grade,
        joinDate: userData.joinDate,
        totalGames: userData.total_score,
        accuracy: userData.accuracy,
        gamesPlayed: userData.gamesPlayed,
        location: userData.location,
      },
      ranking: rankingData.map((rankItem, index) => ({
        ...rankItem,
        rank: index + 1,
      })),
    });
  } catch (error) {
    console.error("프로필 조회 오류:", error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

// 전체 개인 랭킹 조회 라우터
router.get("/ranking", async (req, res) => {
  try {
    const [rankingData] = await db.execute(
      `
      SELECT
        u.name AS username,
        u.school,
        u.grade,
        us.total_score AS score
      FROM users u
      JOIN uscore us ON u.uid = us.uid
      ORDER BY us.total_score DESC, us.games_played DESC
      `
    );

    res.status(200).json(
      rankingData.map((rankItem, index) => ({
        ...rankItem,
        rank: index + 1,
      }))
    );
  } catch (error) {
    console.error("랭킹 조회 오류:", error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

// 학교별 랭킹 조회 라우터
router.get("/ranking/school", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT
        u.school AS school,
        SUM(us.total_score) AS totalScore
      FROM users u
      JOIN uscore us ON u.uid = us.uid
      GROUP BY u.school
      ORDER BY totalScore DESC
      `
    );

    const rankingData = rows.map((r, idx) => ({
      school: r.school,
      totalScore: Number(r.totalScore) || 0,
      rank: idx + 1,
    }));

    res.status(200).json(rankingData);
  } catch (error) {
    console.error("학교별 랭킹 조회 오류:", error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

// 초등학생 랭킹 조회 라우터
router.get("/ranking/elementary", async (req, res) => {
  try {
    const [rankingData] = await db.execute(
      "SELECT * FROM elementary_user_score_ranking ORDER BY ranking ASC"
    );
    res.status(200).json(
      rankingData.map((item) => ({
        ...item,
        username: item.name,
        score: item.total_score,
        rank: item.ranking,
      }))
    );
  } catch (error) {
    console.error("초등학생 랭킹 조회 오류:", error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

// 중학생 랭킹 조회 라우터
router.get("/ranking/middle", async (req, res) => {
  try {
    const [rankingData] = await db.execute(
      "SELECT * FROM middle_user_score_ranking ORDER BY ranking ASC"
    );
    res.status(200).json(
      rankingData.map((item) => ({
        ...item,
        username: item.name,
        score: item.total_score,
        rank: item.ranking,
      }))
    );
  } catch (error) {
    console.error("중학생 랭킹 조회 오류:", error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

// 고등학생 랭킹 조회 라우터
router.get("/ranking/high", async (req, res) => {
  try {
    const [rankingData] = await db.execute(
      "SELECT * FROM high_user_score_ranking ORDER BY ranking ASC"
    );
    res.status(200).json(
      rankingData.map((item) => ({
        ...item,
        username: item.name,
        score: item.total_score,
        rank: item.ranking,
      }))
    );
  } catch (error) {
    console.error("고등학생 랭킹 조회 오류:", error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

module.exports = router;