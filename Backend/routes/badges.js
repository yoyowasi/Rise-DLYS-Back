const express = require('express');
const router = express.Router();
const badgeController = require('../controllers/badgeController');
const { authenticateToken } = require('../middleware/auth'); // JWT 인증 미들웨어

// GET /api/badges - 모든 뱃지 목록 조회 (인증 불필요)
router.get('/', badgeController.getAllBadges);

// GET /api/badges/my-badges - 로그인한 사용자의 뱃지 목록 조회 (인증 필요)
router.get('/my-badges', authenticateToken, badgeController.getMyBadges);

// POST /api/badges/award - 사용자에게 뱃지 수여 (인증 필요)
router.post('/award', authenticateToken, badgeController.awardBadge);

module.exports = router;