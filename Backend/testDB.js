const db = require("./models/db");

async function testConnection() {
  try {
    console.log("🔄 데이터베이스 연결 테스트 중...");
    
    // 간단한 쿼리로 연결 테스트
    const [rows] = await db.query("SELECT 1 as test");
    console.log("✅ 데이터베이스 연결 성공:", rows);
    
    // 테이블 존재 확인
    const [tables] = await db.query("SHOW TABLES");
    console.log("📋 사용 가능한 테이블들:");
    tables.forEach(table => {
      console.log(`  - ${Object.values(table)[0]}`);
    });
    
    // users 테이블 구조 확인
    try {
      const [userStructure] = await db.query("DESCRIBE users");
      console.log("👤 users 테이블 구조:");
      userStructure.forEach(col => {
        console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? '(NOT NULL)' : ''}`);
      });
    } catch (error) {
      console.log("❌ users 테이블이 존재하지 않습니다.");
    }
    
    // news 테이블 구조 확인
    try {
      const [newsStructure] = await db.query("DESCRIBE news");
      console.log("📰 news 테이블 구조:");
      newsStructure.forEach(col => {
        console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? '(NOT NULL)' : ''}`);
      });
      
      // 뉴스 개수 확인
      const [[{ count }]] = await db.query("SELECT COUNT(*) as count FROM news");
      console.log(`📊 총 뉴스 기사 수: ${count}개`);
    } catch (error) {
      console.log("❌ news 테이블이 존재하지 않습니다.");
    }
    
  } catch (error) {
    console.error("❌ 데이터베이스 연결 실패:", error.message);
  } finally {
    process.exit(0);
  }
}

testConnection();
