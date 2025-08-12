import asyncio
import datetime
import os
import re
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlparse

import aiohttp
from bs4 import BeautifulSoup
import mysql.connector

from dotenv import load_dotenv
load_dotenv()

# --- 환경 설정 ---
DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "dlys-database.c41q6i80on7q.us-east-1.rds.amazonaws.com"),
    "user": os.environ.get("DB_USER", "daelim"),
    "password": os.environ.get("DB_PASSWORD", "leeyoosong"),
    "database": os.environ.get("DB_DATABASE", "dlys"),
    "port": int(os.environ.get("DB_PORT", "3306")),
}

# --- 공통 상수 ---
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=15)
CONCURRENCY_LIMIT = 10
FETCH_RETRIES = 3
RETRY_BASE_DELAY = 0.7  # seconds

# 네이버 뉴스 본문 URL 정규식 (예: https://n.news.naver.com/article/001/0012345678)
ARTICLE_URL_RE = re.compile(r"^https?://n\.news\.naver\.com/article/\d+/\d+")

# --- HTTP 요청 ---
async def fetch(session: aiohttp.ClientSession, url: str) -> Optional[str]:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://news.naver.com/",
    }
    for attempt in range(1, FETCH_RETRIES + 1):
        try:
            async with session.get(url, headers=headers) as resp:
                resp.raise_for_status()
                return await resp.text()
        except asyncio.TimeoutError:
            print(f"[TIMEOUT] ({attempt}/{FETCH_RETRIES}) {url}")
        except aiohttp.ClientResponseError as e:
            if 500 <= e.status < 600 and attempt < FETCH_RETRIES:
                print(f"[HTTP {e.status}] 재시도 ({attempt}/{FETCH_RETRIES}) {url}")
            else:
                print(f"[HTTP 오류] {url}: {e.status} {e.message}")
                return None
        except aiohttp.ClientError as e:
            print(f"[HTTP 오류] {url}: {e}")
        if attempt < FETCH_RETRIES:
            await asyncio.sleep(RETRY_BASE_DELAY * attempt)
    return None

# --- 링크 추출 (CSS 의존 제거, 정규식 기반) ---
def extract_links(html: str, base: str) -> List[str]:
    soup = BeautifulSoup(html, "lxml")
    links: List[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        # 상대경로/스킴생략 처리
        if href.startswith("//"):
            href = "https:" + href
        elif href.startswith("/"):
            href = urljoin(base, href)
        # 유효한 기사 링크만
        if ARTICLE_URL_RE.match(href):
            links.append(href)
    # 중복 제거(순서 유지)
    seen = set()
    uniq: List[str] = []
    for u in links:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    return uniq

# --- 본문 파싱 ---
def parse_article_details(html: str, url: str) -> Optional[Dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")

    title_tag = soup.select_one("meta[property='og:title']")
    content_tag = soup.select_one("#dic_area, #newsct_article")
    published_time_tag = soup.select_one("._ARTICLE_DATE_TIME, .media_end_head_info_datestamp_time")

    if not all([title_tag, content_tag, published_time_tag]):
        return None

    title = (title_tag.get("content") or "").strip()
    content = content_tag.get_text(separator="\n", strip=True)
    published_at = published_time_tag.get("data-date-time") or published_time_tag.get_text(strip=True)

    publisher_tag = soup.select_one(".media_end_head_top_logo_img")
    publisher = (publisher_tag.get("title") or "언론사 없음").strip() if publisher_tag else "언론사 없음"

    reporter_tag = soup.select_one(".byline_s, .media_end_head_byline")
    reporter = reporter_tag.get_text(strip=True) if reporter_tag else "기자 정보 없음"

    og_img_tag = soup.select_one("meta[property='og:image']")
    thumbnail_url = og_img_tag.get("content") if og_img_tag else None

    category_tag = soup.select_one(".media_end_categorize_item")
    category = category_tag.get_text(strip=True) if category_tag else "기타"

    return {
        "title": title,
        "content": content,
        "publisher": publisher,
        "reporter": reporter,
        "published_at": published_at,
        "url": url,
        "category": category,
        "thumbnail_url": thumbnail_url,
        "crawled_at": datetime.datetime.now(),
    }

# --- 크롤링 ---
async def crawl_and_parse() -> List[Dict[str, Any]]:
    # 홈 + 섹션(정치100, 경제101, 사회102, 생활/문화103, 세계104, IT/과학105)
    seed_urls = [
        "https://news.naver.com/",
        "https://news.naver.com/section/100",
        "https://news.naver.com/section/101",
        "https://news.naver.com/section/102",
        "https://news.naver.com/section/103",
        "https://news.naver.com/section/104",
        "https://news.naver.com/section/105",
    ]

    connector = aiohttp.TCPConnector(limit=CONCURRENCY_LIMIT)
    async with aiohttp.ClientSession(timeout=REQUEST_TIMEOUT, connector=connector) as session:
        # 시드 페이지 동시 요청
        seeds = await asyncio.gather(*[fetch(session, u) for u in seed_urls])
        all_links: List[str] = []
        for html, base in zip(seeds, seed_urls):
            if html:
                all_links.extend(extract_links(html, base))

        # 중복 제거
        seen = set()
        unique_links: List[str] = []
        for href in all_links:
            if href not in seen:
                seen.add(href)
                unique_links.append(href)

        if not unique_links:
            print("❌[오류] 기사 링크를 수집하지 못했습니다. 정규식/시드 URL을 확인하세요.")
            return []

        print(f"📰 총 {len(unique_links)}개의 기사 링크 수집. 본문 요청 시작.")

        pages_html = await asyncio.gather(*[fetch(session, link) for link in unique_links])

        results: List[Dict[str, Any]] = []
        for html, url in zip(pages_html, unique_links):
            if html:
                article_data = parse_article_details(html, url)
                if article_data:
                    results.append(article_data)

        return results

# --- DB 저장 ---
def save_to_mysql(headlines: List[Dict[str, Any]]):
    if not headlines:
        print("📭 저장할 뉴스가 없습니다.")
        return

    insert_data = [
        (
            d["title"],
            d["content"],
            d["publisher"],
            d["reporter"],
            d["published_at"],
            d["url"],
            d["category"],
            d["thumbnail_url"],
            d["crawled_at"],
        )
        for d in headlines
    ]

    query = """
        INSERT INTO news (
            title, content, publisher, reporter, published_at,
            url, category, thumbnail_url, crawled_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE url = VALUES(url)
    """

    try:
        with mysql.connector.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cursor:
                cursor.executemany(query, insert_data)
                conn.commit()
                print(f"✅ DB 처리 완료 (요청 건수: {len(insert_data)})")
    except mysql.connector.Error as e:
        print(f"[DB 오류] 데이터 저장 실패: {e}")

# --- 실행 ---
if __name__ == "__main__":
    print(f"🚀 {datetime.datetime.now()} - 뉴스 크롤링을 시작합니다.")
    news_articles = asyncio.run(crawl_and_parse())

    if news_articles:
        print(f"✔️ 총 {len(news_articles)}건의 기사 수집 완료. 데이터베이스 저장을 시작합니다.")
        save_to_mysql(news_articles)
    else:
        print("🔴 수집된 기사가 없습니다.")

    print("✨ 모든 작업이 완료되었습니다.")
