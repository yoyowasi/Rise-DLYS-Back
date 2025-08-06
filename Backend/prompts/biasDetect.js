module.exports = function makeBiasPrompt(newsA, newsB) {
  return `
두 개의 뉴스 기사가 있습니다. 두 기사는 동일한 주제를 다루지만 표현 방식이 다릅니다.

[뉴스 A 제목]
${newsA.title}

[뉴스 A 내용]
${newsA.content}

[뉴스 B 제목]
${newsB.title}

[뉴스 B 내용]
${newsB.content}

Q. 두 기사 중 어느 쪽이 더 편향적인 표현을 사용하고 있습니까? A 또는 B로만 답변해 주세요.
  `.trim();
};
