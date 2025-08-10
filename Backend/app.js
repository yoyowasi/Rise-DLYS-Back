const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const oneLineRoutes = require("./routes/Compare/oneLine"); // ✅ 소문자 // 추가
const biasRoutes = require("./routes/Compare/biasDetect");
const fakeNewsRoutes = require("./routes/Compare/fakeNews");
const userRoutes = require("./routes/userController");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/compare-random", oneLineRoutes); // ✅ 경로 등록
app.use("/api/compare-biasDetect", biasRoutes);
app.use("/api/fake-news", fakeNewsRoutes);

app.get("/", (req, res) => {
  res.send("✅ 백엔드 서버 작동 중 (from app.js)");
});

module.exports = app;
