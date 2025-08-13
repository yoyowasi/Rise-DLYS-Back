const pool = require('../models/db');

/**
 * 사용자에게 특정 뱃지를 부여하는 함수 (중복 방지)
 */
const awardBadge = async (connection, uid, badgeName) => {
    try {
        const [badges] = await connection.query('SELECT bid FROM badges WHERE bname = ?', [badgeName]);
        if (badges.length > 0) {
            const badgeId = badges[0].bid;
            // INSERT IGNORE: 이미 해당 uid, bid 쌍이 존재하면 무시하고 넘어감
            await connection.query('INSERT IGNORE INTO user_badges (uid, bid) VALUES (?, ?)', [uid, badgeId]);
            console.log(`[Badge Check] User ${uid} awarded '${badgeName}' (if not already possessed).`);
        }
    } catch (error) {
        console.error(`'${badgeName}' 뱃지 부여 중 오류 발생:`, error);
        // 오류 발생 시 트랜잭션이 롤백되도록 에러를 다시 던집니다.
        throw error;
    }
};

/**
 * 게임 종료 후 점수, 랭킹 기반 뱃지 획득 조건을 확인하고 부여하는 함수
 */
exports.checkAndAwardPostGameBadges = async (connection, uid) => {
    try {
        // [수정] users 테이블이 아닌 uscore 테이블에서 점수 정보를 조회합니다.
        const [[userScore]] = await connection.query(
            'SELECT total_score, games_played FROM uscore WHERE uid = ?',
            [uid]
        );

        if (!userScore) return;

        // "뉴스 뉴비" 뱃지: 첫 게임 완료 시 (games_played가 1일 때)
        if (userScore.games_played === 1) {
            await awardBadge(connection, uid, '뉴스 뉴비');
        }

        // "뉴스 마스터" 뱃지: 누적 점수 1000점 이상
        if (userScore.total_score >= 1000) {
            await awardBadge(connection, uid, '뉴스 마스터');
        }

        // "문해력 왕" 뱃지: 랭킹 1위 달성
        const [[topRanker]] = await connection.query(
            'SELECT uid FROM uscore ORDER BY total_score DESC, uid ASC LIMIT 1'
        );

        if (topRanker && topRanker.uid === uid) {
            await awardBadge(connection, uid, '문해력 왕');
        }

    } catch (error) {
        console.error('게임 후 뱃지 체크 중 오류:', error);
        // 트랜잭션 롤백을 위해 에러를 다시 던집니다.
        throw error;
    }
};