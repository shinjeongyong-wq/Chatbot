-- =====================================================
-- Supabase 테이블 생성 SQL
-- 이 SQL을 Supabase 대시보드 > SQL Editor에서 실행하세요.
-- =====================================================

-- 1. users 테이블 (사용자 정보)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL CHECK (specialty IN ('통증', '미용', '내과', '치과')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 이름 + 진료과 조합으로 고유 식별
  UNIQUE(name, specialty)
);

-- 2. chat_sessions 테이블 (채팅방 목록)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '새로운 채팅',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. messages 테이블 (실제 대화 내용)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 인덱스 생성 (성능 최적화)
-- =====================================================

-- 사용자 조회 최적화
CREATE INDEX IF NOT EXISTS idx_users_name_specialty ON users(name, specialty);

-- 세션 목록 조회 최적화
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC);

-- 메시지 조회 최적화
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- =====================================================
-- Row Level Security (RLS) 정책
-- 참고: anon key 사용 시 기본적으로 모든 접근 허용
-- 필요 시 추가 보안 정책 설정 가능
-- =====================================================

-- RLS 활성화
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- anon 사용자에게 모든 권한 부여 (개발용, 프로덕션에서는 조정 필요)
CREATE POLICY "Allow all for anon" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON chat_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON messages FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 완료!
-- =====================================================
