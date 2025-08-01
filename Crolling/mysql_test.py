import mysql.connector

try:
    conn = mysql.connector.connect(
        host="localhost",
        user="root",
        password="1234",         # 👉 실제 비밀번호로 바꾸세요
        database="RiseTest",   # 👉 실제 생성한 DB명으로 바꾸세요
        port=3306
    )
    
    cursor = conn.cursor()
    cursor.execute("SELECT VERSION();")
    version = cursor.fetchone()
    print("✅ MySQL 연결 성공, 버전:", version[0])

except mysql.connector.Error as err:
    print("❌ 연결 실패:", err)

finally:
    if 'conn' in locals() and conn.is_connected():
        cursor.close()
        conn.close()
