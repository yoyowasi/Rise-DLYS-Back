import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: AIzaSyAa1e_Ckzilu5x8tyBC530N60l1NcbMsPg });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Explain how AI works in a few words",
  });
  console.log(response.text);
}

main();
