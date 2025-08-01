const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../models/db");
const router = express.Router();
const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret";

// ✅ 프론트에 맞춘 필드명: username, confirmPassword
router.post("/signup", async (req, res) => {
  const { username, email, school, grade, password, confirmPassword } =
    req.body;

  if (
    !username ||
    !email ||
    !school ||
    !grade ||
    !password ||
    !confirmPassword
  ) {
    return res.status(400).json({ message: "모든 항목을 입력해주세요." });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "비밀번호가 일치하지 않습니다." });
  }

  try {
    const [existing] = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "이미 등록된 이메일입니다." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.execute(
      "INSERT INTO users (name, email, school, grade, password) VALUES (?, ?, ?, ?, ?)",
      [username, email, school, grade, hashedPassword]
    );

    res.status(201).json({ message: "회원가입이 완료되었습니다." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

// 로그인 라우터
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

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
      return res.status(401).json({ message: "존재하지 않는 사용자입니다." });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "비밀번호가 일치하지 않습니다." });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({ message: "로그인 성공", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류 발생", error: error.message });
  }
});

module.exports = router;

router.get("/test", (req, res) => {
  res.send("라우터 연결 정상 작동 중!");
});
