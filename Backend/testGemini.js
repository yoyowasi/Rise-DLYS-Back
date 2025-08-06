require("dotenv").config(); // .env에서 API 키 로드
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ✅ 환경 변수에서 정확히 키를 불러오는지 디버깅 출력
console.log("[디버그] GEMINI_API_KEY:", process.env.GOOGLE_API_KEY);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // 모델 이름은 정확히 "gemini-pro" 사용
    const result = await model.generateContent("한 줄로 자기소개 해줘");
    const response = await result.response;
    console.log("[✅ Gemini 응답]", await response.text());
  } catch (err) {
    console.error("[❌ 실패]", err);
  }
}

test();
