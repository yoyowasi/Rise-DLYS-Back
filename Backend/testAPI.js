const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

// 테스트용 사용자 데이터
const testUser = {
  username: "테스트유저",
  email: "test@example.com",
  school: "테스트학교",
  grade: 5, // 1-6 사이 값으로 수정
  password: "testpassword123",
  confirmPassword: "testpassword123",
  location: "서울"
};

async function testAPI() {
  try {
    console.log('🔄 API 테스트 시작...\n');

    // 1. 서버 상태 확인
    console.log('1. 서버 상태 확인');
    const healthCheck = await axios.get(`${BASE_URL}/`);
    console.log('✅ 서버 응답:', healthCheck.data);
    console.log('');

    // 2. 회원가입 테스트
    console.log('2. 회원가입 테스트');
    try {
      const signupResponse = await axios.post(`${BASE_URL}/api/auth/signup`, testUser);
      console.log('✅ 회원가입 성공:', signupResponse.data);
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('ℹ️ 이미 존재하는 사용자 (정상)');
      } else {
        console.log('❌ 회원가입 실패:', error.response?.data || error.message);
      }
    }
    console.log('');

    // 3. 로그인 테스트
    console.log('3. 로그인 테스트');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    console.log('✅ 로그인 성공:', loginResponse.data);
    const token = loginResponse.data.token;
    console.log('');

    // 4. 인증이 필요한 API 테스트 (헤더 설정)
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 5. 뉴스 가져오기 테스트
    console.log('4. 뉴스 가져오기 테스트');
    const newsResponse = await axios.get(`${BASE_URL}/api/compare-random/`);
    console.log('✅ 뉴스 조회 성공:', {
      id: newsResponse.data.id,
      title: newsResponse.data.title.substring(0, 50) + '...'
    });
    console.log('');

    // 6. 가짜뉴스 문제 생성 테스트
    console.log('5. 가짜뉴스 문제 생성 테스트');
    const fakeNewsResponse = await axios.get(`${BASE_URL}/api/fake-news/`);
    console.log('✅ 가짜뉴스 문제 생성 성공:', {
      hasQuestionToken: !!fakeNewsResponse.data.questionToken,
      articleLength: fakeNewsResponse.data.article?.length || 0,
      options: fakeNewsResponse.data.options
    });
    console.log('');

    // 7. 사용자 프로필 조회 테스트
    console.log('6. 사용자 프로필 조회 테스트');
    const profileResponse = await axios.get(`${BASE_URL}/api/users/profile`, {
      headers: authHeaders
    });
    console.log('✅ 프로필 조회 성공:', {
      username: profileResponse.data.profile.username,
      school: profileResponse.data.profile.school,
      rankingCount: profileResponse.data.ranking?.length || 0
    });
    console.log('');

    console.log('🎉 모든 API 테스트 완료!');

  } catch (error) {
    console.error('❌ API 테스트 실패:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('HTTP 상태:', error.response.status);
    }
  }
}

// axios 설치 확인
try {
  testAPI();
} catch (error) {
  console.error('axios가 설치되지 않았습니다. npm install axios를 실행하세요.');
}
