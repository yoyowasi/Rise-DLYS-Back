import requests
from bs4 import BeautifulSoup
import mysql.connector
import datetime

def crawl_naver_news():
    url = "https://news.naver.com/"
    headers = {
        "User-Agent": "Mozilla/5.0"
    }

    try:
        response = requests.get(url, headers=headers, timeout=5)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] 요청 실패: {e}")
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    headlines = []

    title_tags = soup.select("a[href^='https://n.news.naver.com']")

    for tag in title_tags:
        title = tag.get_text(strip=True)
        link = tag.get("href")
        if not link.startswith("http"):
            link = "https://news.naver.com" + link

        try:
            detail = requests.get(link, headers=headers, timeout=5)
            detail.raise_for_status()
            detail_soup = BeautifulSoup(detail.text, "html.parser")

            content = detail_soup.select_one("#dic_area")
            publisher_img = detail_soup.select_one(".press_logo img")
            publisher_meta = detail_soup.select_one("meta[property='og:article:author']")
            reporter = detail_soup.select_one(".byline_s")
            published_time_tag = detail_soup.select_one("._ARTICLE_DATE_TIME[data-date-time]")
            thumbnail = detail_soup.select_one("meta[property='og:image']")
            category = "기타"

            published_at = published_time_tag.get("data-date-time") if published_time_tag else None
            if not published_at:
                print(f"[스킵] 발행 시간 없음: {link}")
                continue

            # 기자가 없으면 스킵
            if not reporter:
                print(f"[스킵] 기자 없음: {title}")
                continue

            publisher = publisher_img.get("alt") if publisher_img else (
                publisher_meta.get("content") if publisher_meta else "알 수 없음"
            )

            headlines.append({
                "title": title,
                "content": content.get_text(strip=True) if content else "",
                "publisher": publisher,
                "reporter": reporter.get_text(strip=True),
                "published_at": published_at,
                "url": link,
                "category": category,
                "thumbnail_url": thumbnail.get("content") if thumbnail else None,
                "crawled_at": datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })

        except requests.exceptions.Timeout:
            print(f"[TIMEOUT] 타임아웃 발생: {link}")
            continue
        except Exception as e:
            print(f"[WARN] 상세 크롤링 실패 ({link}): {e}")
            continue

    return headlines

def save_to_mysql(headlines):
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="1234",  # 비밀번호 맞게 수정
            database="risetest",
            port=3306
        )
        cursor = conn.cursor()
        inserted = 0

        for item in headlines:
            try:
                cursor.execute("""
                    INSERT INTO news (
                        title, content, publisher, reporter, published_at,
                        url, category, thumbnail_url, crawled_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    item["title"],
                    item["content"],
                    item["publisher"],
                    item["reporter"],
                    item["published_at"],
                    item["url"],
                    item["category"],
                    item["thumbnail_url"],
                    item["crawled_at"]
                ))
                inserted += 1
            except mysql.connector.IntegrityError:
                print(f"[중복] 스킵: {item['published_at']} {item['title']}")
                continue

        conn.commit()
        print(f"✅ 총 {inserted}건 저장 완료.")
    except mysql.connector.Error as e:
        print(f"[DB 오류] {e}")
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals() and conn.is_connected():
            conn.close()

if __name__ == "__main__":
    print("🕒 뉴스 크롤링 시작...")
    data = crawl_naver_news()
    if data:
        save_to_mysql(data)
    else:
        print("📭 뉴스 없음.")
