const pool = require('../models/db'); // 👈 경로 수정: '../database' -> '../models/db'

// 모든 뱃지 목록 조회
exports.getAllBadges = async (req, res) => {
    try {
        const [badges] = await pool.query('SELECT bid, bname, description, image_url FROM badges');
        res.json(badges);
    } catch (error) {
        console.error('전체 뱃지 목록 조회 오류:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
};

// 현재 로그인한 사용자가 획득한 뱃지 목록 조회
exports.getMyBadges = async (req, res) => {
    try {
        const userId = req.user.uid;
        if (!userId) {
            return res.status(401).json({ message: '인증되지 않은 사용자입니다.' });
        }

        const query = `
            SELECT b.bid, b.bname, b.description, b.image_url, ub.awarded_at
            FROM user_badges ub
            JOIN badges b ON ub.bid = b.bid
            WHERE ub.uid = ?
            ORDER BY ub.awarded_at DESC
        `;
        const [earnedBadges] = await pool.query(query, [userId]);
        res.json(earnedBadges);
    } catch (error) {
        console.error('획득한 뱃지 조회 오류:', error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
};

// 사용자에게 뱃지 수여
exports.awardBadge = async (req, res) => {
    const { badgeName } = req.body;
    const userId = req.user.uid;

    if (!badgeName) {
        return res.status(400).json({ message: '뱃지 이름이 필요합니다.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [badges] = await connection.query('SELECT bid FROM badges WHERE bname = ?', [badgeName]);
        if (badges.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: '존재하지 않는 뱃지입니다.' });
        }
        const badgeId = badges[0].bid;

        const [existing] = await connection.query('SELECT id FROM user_badges WHERE uid = ? AND bid = ?', [userId, badgeId]);
        if (existing.length > 0) {
            await connection.commit();
            return res.status(200).json({ message: '이미 획득한 뱃지입니다.' });
        }

        await connection.query('INSERT INTO user_badges (uid, bid) VALUES (?, ?)', [userId, badgeId]);
        await connection.commit();
        
        const [awardedBadge] = await connection.query('SELECT * FROM badges WHERE bid = ?', [badgeId]);
        res.status(201).json({ message: '새로운 뱃지를 획득했습니다!', awardedBadge: awardedBadge[0] });

    } catch (error) {
        await connection.rollback();
        console.error('뱃지 수여 오류:', error);
        res.status(500).json({ message: '뱃지 수여 중 서버 오류가 발생했습니다.' });
    } finally {
        connection.release();
    }
};