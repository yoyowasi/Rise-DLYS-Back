// prompts/problemSummary.js
module.exports = ({ title, content }) => `
당신은 뉴스 기사 요약 전문가입니다. 다음 뉴스 기사를 학생들이 이해하기 쉽도록 핵심 내용만 간추려 4~5 문장으로 요약해주세요. 원본의 어조를 유지하되, 불필요한 세부 정보는 제거하고 가장 중요한 사실 위주로 작성해주세요.

[제목]
${title}

[내용]
${content}

[요약 결과]
`;
