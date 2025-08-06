// getRandomNews.js
const db = require("../models/db");

async function getRandomNews() {
  const [rows] = await db.query("SELECT * FROM news ORDER BY RAND() LIMIT 1");
  return rows[0]; // 1개만
}

module.exports = { getRandomNews };
