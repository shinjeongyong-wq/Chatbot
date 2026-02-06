-- =====================================================
-- Session Document Summaries 테이블 생성
-- 세션별로 읽은 문서의 요약본을 캐싱하기 위한 테이블
-- =====================================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS session_doc_summaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL,           -- 원본 문서 ID (예: notion-roadmap-2fc62ade)
    doc_source TEXT NOT NULL,       -- 문서 출처 (notion, qa, faq)
    original_question TEXT,         -- 원본 문서의 질문 (참조용)
    original_length INTEGER,        -- 원본 길이 (자)
    summary TEXT NOT NULL,          -- 요약본 내용
    summary_length INTEGER,         -- 요약 길이 (자)
    paragraphs JSONB,               -- 노션용: 문단별 요약 배열
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 복합 유니크 키: 같은 세션에서 같은 문서는 한 번만
    UNIQUE(session_id, doc_id)
);

-- 2. 인덱스 생성 (빠른 조회를 위해)
CREATE INDEX IF NOT EXISTS idx_session_doc_summaries_session 
ON session_doc_summaries(session_id);

CREATE INDEX IF NOT EXISTS idx_session_doc_summaries_doc 
ON session_doc_summaries(doc_id);

CREATE INDEX IF NOT EXISTS idx_session_doc_summaries_lookup 
ON session_doc_summaries(session_id, doc_id);

-- 3. RLS (Row Level Security) 활성화
ALTER TABLE session_doc_summaries ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책: 사용자는 자신의 세션에 속한 요약만 접근 가능
CREATE POLICY "Users can access their own session summaries" 
ON session_doc_summaries
FOR ALL
USING (
    session_id IN (
        SELECT id FROM chat_sessions 
        WHERE user_id = (
            SELECT id FROM users 
            WHERE id = current_setting('request.jwt.claims', true)::json->>'sub'::text
        )
    )
);

-- 5. 익명 사용자(anon)도 접근 가능하도록 정책 추가 (개발용)
CREATE POLICY "Allow anon access to session summaries"
ON session_doc_summaries
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- =====================================================
-- 확인 쿼리
-- =====================================================
-- SELECT * FROM session_doc_summaries LIMIT 10;
