const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../models/db");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { authenticateToken, JWT_SECRET } = require("../middleware/auth");
require("dotenv").config();

// ✅ 회원가입 라우터
router.post("/signup", async (req, res) => {
  const {
    username,
    email,
    school,
    grade,
    password,
    confirmPassword,
    location,
  } = req.body;

  if (
    !username ||
    !email ||
    !school ||
    !grade ||
    !password ||
    !confirmPassword ||
    !location
  ) {
    return res.status(400).json({ message: "모든 항목을 입력해주세요." });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "비밀번호가 일치하지 않습니다." });
  }

  const parsedGrade = parseInt(grade, 10);
  if (isNaN(parsedGrade) || parsedGrade < 1 || parsedGrade > 6) {
    return res
      .status(400)
      .json({ message: "학년은 1부터 6 사이의 숫자여야 합니다." });
  }

  try {
    const [existing] = await db.execute(
      "SELECT uid FROM users WHERE email = ?",
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "이미 등록된 이메일입니다." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.execute(
      "INSERT INTO users (name, email, school, grade, password, location) VALUES (?, ?, ?, ?, ?, ?)",
      [username, email, school, parsedGrade, hashedPassword, location]
    );

    res.status(201).json({ message: "회원가입이 완료되었습니다." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

// ✅ 로그인 라우터
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  console.log("로그인 요청 데이터:", req.body); // ✅ 전송된 데이터 확인

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "이메일과 비밀번호를 입력해주세요." });
  }

  try {
    const [users] = await db.execute("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (users.length === 0) {
      console.log(
        "❌ 사용자 찾기 실패: 해당 이메일로 등록된 사용자가 없습니다."
      );
      return res.status(401).json({ message: "존재하지 않는 사용자입니다." });
    }

    const user = users[0];
    console.log("✅ 데이터베이스에서 찾은 사용자:", user); // ✅ 사용자 정보 확인

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.log(
        "❌ 비밀번호 불일치: 입력된 비밀번호와 DB의 비밀번호가 일치하지 않습니다."
      );
      return res.status(401).json({ message: "비밀번호가 일치하지 않습니다." });
    }

    console.log("✅ 비밀번호 일치: 로그인 성공"); // ✅ 비밀번호 일치 확인
    const token = jwt.sign({ uid: user.uid, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({ message: "로그인 성공", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

// ✅ 사용자 프로필 업데이트 라우터
router.put("/profile", authenticateToken, async (req, res) => {
  const { username, school, location, grade } = req.body;
  const { uid } = req.user; // JWT 토큰에서 사용자 ID를 추출

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

    res
      .status(200)
      .json({ message: "프로필이 성공적으로 업데이트되었습니다." });
  } catch (error) {
    console.error("프로필 업데이트 오류:", error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

module.exports = router;
