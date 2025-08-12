// 전역 에러 핸들링 미들웨어
const errorHandler = (err, req, res, next) => {
  console.error('🚨 서버 에러:', err);

  // JWT 에러 처리
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ 
      message: '유효하지 않은 토큰입니다.',
      error: 'INVALID_TOKEN' 
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ 
      message: '토큰이 만료되었습니다.',
      error: 'TOKEN_EXPIRED' 
    });
  }

  // 데이터베이스 에러 처리
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ 
      message: '중복된 데이터입니다.',
      error: 'DUPLICATE_ENTRY' 
    });
  }

  if (err.code === 'ER_NO_SUCH_TABLE') {
    return res.status(500).json({ 
      message: '데이터베이스 테이블을 찾을 수 없습니다.',
      error: 'TABLE_NOT_FOUND' 
    });
  }

  // 기본 에러 응답
  res.status(err.status || 500).json({
    message: err.message || '서버 내부 오류가 발생했습니다.',
    error: process.env.NODE_ENV === 'development' ? err.stack : 'INTERNAL_SERVER_ERROR'
  });
};

// 404 에러 핸들러
const notFoundHandler = (req, res) => {
  res.status(404).json({
    message: `경로를 찾을 수 없습니다: ${req.method} ${req.path}`,
    error: 'NOT_FOUND'
  });
};

module.exports = { errorHandler, notFoundHandler };
