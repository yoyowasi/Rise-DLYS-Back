// 📁 server.js
const app = require("./app"); // ← app.js 가져오기


const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✅ 백엔드 서버 실행됨: http://localhost:${PORT}`);
});
