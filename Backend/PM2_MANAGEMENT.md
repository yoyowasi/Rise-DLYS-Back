# PM2 서버 관리 가이드

## PM2 기본 명령어

### 서버 시작/중지/재시작
```bash
# 서버 시작
pm2 start server.js --name "rise-server"

# 또는 package.json의 start 스크립트 사용
pm2 start npm --name "rise-server" -- start

# 서버 중지
pm2 stop rise-server

# 서버 재시작
pm2 restart rise-server

# 서버 삭제 (프로세스 완전 제거)
pm2 delete rise-server
```

### 서버 상태 확인
```bash
# 전체 프로세스 목록 확인
pm2 list
pm2 status

# 특정 프로세스 상세 정보
pm2 info rise-server

# 실시간 모니터링
pm2 monit
```

### 로그 관리
```bash
# 실시간 로그 확인
pm2 logs rise-server

# 최근 N줄 로그 확인
pm2 logs rise-server --lines 50

# 에러 로그만 확인
pm2 logs rise-server --err

# 로그 파일 위치
# Error: ~/.pm2/logs/rise-server-error.log
# Output: ~/.pm2/logs/rise-server-out.log

# 로그 초기화
pm2 flush
```

### 환경 변수 관리
```bash
# 환경 변수 확인
pm2 env 0

# 환경 변수 업데이트하여 재시작
pm2 restart rise-server --update-env
```

## 자동 시작 설정

### 시스템 부팅 시 자동 시작
```bash
# PM2 startup 스크립트 생성
pm2 startup

# 현재 프로세스 목록 저장
pm2 save

# 저장된 프로세스 복원
pm2 resurrect
```

## 성능 모니터링

### 메모리 및 CPU 사용량 확인
```bash
# 실시간 모니터링 대시보드
pm2 monit

# 프로세스별 리소스 사용량
pm2 list

# 상세 성능 지표
pm2 info rise-server
```

### 메모리 누수 감지
```bash
# 힙 덤프 생성
pm2 trigger rise-server km:heapdump

# CPU 프로파일링 시작/중지
pm2 trigger rise-server km:cpu:profiling:start
pm2 trigger rise-server km:cpu:profiling:stop
```

## 크롤링 관리

### 크롤링 스케줄링
```bash
# cron을 사용한 정기 크롤링 설정
crontab -e

# 예시: 매일 오전 6시에 뉴스 크롤링
0 6 * * * cd /home/ec2-user/Rise-DLYS-Back/Backend && node crawling/newsCrawler.js

# 매 시간마다 데이터 업데이트
0 * * * * cd /home/ec2-user/Rise-DLYS-Back/Backend && node crawling/updateData.js
```

### 크롤링 프로세스 관리
```bash
# 크롤링 전용 PM2 프로세스 시작
pm2 start crawling/newsCrawler.js --name "news-crawler" --cron "0 */6 * * *"

# 크롤링 프로세스 상태 확인
pm2 list | grep crawler

# 크롤링 로그 확인
pm2 logs news-crawler
```

### 크롤링 에러 처리
```bash
# 크롤링 실패 시 자동 재시작 설정
pm2 start crawling/newsCrawler.js --name "news-crawler" --max-restarts 3

# 크롤링 프로세스 강제 재시작
pm2 restart news-crawler

# 크롤링 에러 로그 분석
pm2 logs news-crawler --err --lines 100
```

## 배포 및 업데이트

### 무중단 배포
```bash
# 코드 업데이트 후 무중단 재시작
git pull origin main
npm install
pm2 reload rise-server
```

### 롤백
```bash
# 이전 버전으로 롤백
git checkout HEAD~1
pm2 restart rise-server
```

## 트러블슈팅

### 일반적인 문제 해결
```bash
# 서버가 응답하지 않을 때
pm2 restart rise-server

# 메모리 사용량이 높을 때
pm2 restart rise-server
pm2 logs rise-server --lines 100

# 포트 충돌 문제
netstat -tlnp | grep :4000
pm2 restart rise-server

# 환경 변수 문제
pm2 env 0
pm2 restart rise-server --update-env
```

### 긴급 상황 대응
```bash
# 모든 PM2 프로세스 중지
pm2 stop all

# 모든 PM2 프로세스 삭제
pm2 delete all

# PM2 데몬 재시작
pm2 kill
pm2 resurrect
```

## 모니터링 및 알림

### 프로세스 상태 체크 스크립트
```bash
#!/bin/bash
# health_check.sh
STATUS=$(pm2 jlist | jq -r '.[0].pm2_env.status')
if [ "$STATUS" != "online" ]; then
    echo "Server is down! Restarting..."
    pm2 restart rise-server
    # 슬랙/이메일 알림 발송
fi
```

### 정기 헬스체크
```bash
# crontab에 추가
*/5 * * * * /home/ec2-user/Rise-DLYS-Back/Backend/health_check.sh
```

## 백업 및 복구

### 설정 백업
```bash
# PM2 설정 백업
pm2 save
cp ~/.pm2/dump.pm2 ~/backup/dump.pm2.$(date +%Y%m%d)

# 로그 백업
tar -czf ~/backup/pm2-logs-$(date +%Y%m%d).tar.gz ~/.pm2/logs/
```

### 복구
```bash
# PM2 설정 복구
cp ~/backup/dump.pm2.20240813 ~/.pm2/dump.pm2
pm2 resurrect
```

## 성능 최적화

### 클러스터 모드 (멀티코어 활용)
```bash
# CPU 코어 수만큼 인스턴스 생성
pm2 start server.js --name "rise-server" -i max

# 특정 개수의 인스턴스 생성
pm2 start server.js --name "rise-server" -i 4
```

### 메모리 제한 설정
```bash
# 메모리 사용량 제한 (512MB)
pm2 start server.js --name "rise-server" --max-memory-restart 512M
```

---

## 현재 서버 정보
- **서버명**: rise-server
- **포트**: 4000
- **실행 디렉토리**: `/home/ec2-user/Rise-DLYS-Back/Backend`
- **Node.js 버전**: 22.17.1
- **로그 위치**: `~/.pm2/logs/rise-server-*.log`

## 유용한 별칭 설정
```bash
# ~/.bashrc에 추가
alias pm2-status='pm2 status'
alias pm2-logs='pm2 logs rise-server'
alias pm2-restart='pm2 restart rise-server'
alias pm2-monitor='pm2 monit'
```
