/**
 * 메시지 API
 * 
 * GET /api/messages?sessionId=xxx
 *   - 특정 세션의 모든 메시지 조회
 * 
 * POST /api/messages
 *   - 새 메시지 저장
 *   - Body: { sessionId: string, role: 'user' | 'assistant', content: string }
 * 
 * POST /api/messages (bulk)
 *   - 여러 메시지 한번에 저장 (사용자 질문 + AI 답변)
 *   - Body: { sessionId: string, messages: [{ role, content }, ...] }
 */

const { supabase } = require('../lib/supabase');

module.exports = async (req, res) => {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // ============ GET: 메시지 조회 ============
        if (req.method === 'GET') {
            const { sessionId } = req.query;

            if (!sessionId) {
                return res.status(400).json({ error: 'sessionId가 필요합니다.' });
            }

            const { data: messages, error } = await supabase
                .from('messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('메시지 조회 에러:', error);
                throw error;
            }

            return res.status(200).json({
                success: true,
                messages: messages || []
            });
        }

        // ============ POST: 메시지 저장 ============
        if (req.method === 'POST') {
            const { sessionId, role, content, messages: bulkMessages } = req.body;

            // Bulk insert (여러 메시지)
            if (bulkMessages && Array.isArray(bulkMessages)) {
                if (!sessionId) {
                    return res.status(400).json({ error: 'sessionId가 필요합니다.' });
                }

                const messagesToInsert = bulkMessages.map(msg => ({
                    session_id: sessionId,
                    role: msg.role,
                    content: msg.content
                }));

                const { data: insertedMessages, error } = await supabase
                    .from('messages')
                    .insert(messagesToInsert)
                    .select();

                if (error) {
                    console.error('메시지 bulk insert 에러:', error);
                    throw error;
                }

                console.log(`💬 메시지 ${insertedMessages.length}개 저장됨`);
                return res.status(201).json({
                    success: true,
                    messages: insertedMessages
                });
            }

            // Single insert (단일 메시지)
            if (!sessionId || !role || !content) {
                return res.status(400).json({
                    error: 'sessionId, role, content가 모두 필요합니다.'
                });
            }

            if (!['user', 'assistant'].includes(role)) {
                return res.status(400).json({
                    error: 'role은 user 또는 assistant여야 합니다.'
                });
            }

            const { data: newMessage, error } = await supabase
                .from('messages')
                .insert([{
                    session_id: sessionId,
                    role,
                    content
                }])
                .select()
                .single();

            if (error) {
                console.error('메시지 저장 에러:', error);
                throw error;
            }

            console.log(`💬 새 메시지 저장: ${role}`);
            return res.status(201).json({
                success: true,
                message: newMessage
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Messages API 에러:', error);
        return res.status(500).json({
            error: '서버 오류가 발생했습니다.',
            details: error.message
        });
    }
};
