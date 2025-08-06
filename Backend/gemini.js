require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// apiKey를 환경 변수에서 가져옵니다.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function main() {
  // 텍스트 전용 모델을 사용합니다.
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = "Explain how AI works in a few words";

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  console.log(text);
}

main();
