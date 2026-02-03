/**
 * 채팅 세션 API
 * 
 * GET /api/sessions?userId=xxx
 *   - 해당 사용자의 모든 채팅 세션 목록 조회
 * 
 * POST /api/sessions
 *   - 새 채팅 세션 생성
 *   - Body: { userId: string, title?: string }
 * 
 * DELETE /api/sessions?sessionId=xxx
 *   - 특정 세션 삭제
 */

const { supabase } = require('../lib/supabase');

module.exports = async (req, res) => {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // ============ GET: 세션 목록 조회 ============
        if (req.method === 'GET') {
            const { userId } = req.query;

            if (!userId) {
                return res.status(400).json({ error: 'userId가 필요합니다.' });
            }

            const { data: sessions, error } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('세션 조회 에러:', error);
                throw error;
            }

            return res.status(200).json({
                success: true,
                sessions: sessions || []
            });
        }

        // ============ POST: 새 세션 생성 ============
        if (req.method === 'POST') {
            const { userId, title } = req.body;

            if (!userId) {
                return res.status(400).json({ error: 'userId가 필요합니다.' });
            }

            const { data: newSession, error } = await supabase
                .from('chat_sessions')
                .insert([{
                    user_id: userId,
                    title: title || '새로운 채팅'
                }])
                .select()
                .single();

            if (error) {
                console.error('세션 생성 에러:', error);
                throw error;
            }

            console.log(`📝 새 채팅 세션 생성: ${newSession.id}`);
            return res.status(201).json({
                success: true,
                session: newSession
            });
        }

        // ============ DELETE: 세션 삭제 ============
        if (req.method === 'DELETE') {
            const { sessionId } = req.query;

            if (!sessionId) {
                return res.status(400).json({ error: 'sessionId가 필요합니다.' });
            }

            const { error } = await supabase
                .from('chat_sessions')
                .delete()
                .eq('id', sessionId);

            if (error) {
                console.error('세션 삭제 에러:', error);
                throw error;
            }

            console.log(`🗑️ 채팅 세션 삭제: ${sessionId}`);
            return res.status(200).json({
                success: true,
                message: '세션이 삭제되었습니다.'
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Sessions API 에러:', error);
        return res.status(500).json({
            error: '서버 오류가 발생했습니다.',
            details: error.message
        });
    }
};
