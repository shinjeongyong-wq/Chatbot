/**
 * 사용자 로그인/등록 API
 * POST /api/auth
 * 
 * Request Body:
 *   { name: string, specialty: '통증' | '미용' | '내과' | '치과' }
 * 
 * Response:
 *   { success: true, user: { id, name, specialty } }
 */

const { supabase } = require('../lib/supabase');

module.exports = async (req, res) => {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { name, specialty } = req.body;

        // 입력 검증
        if (!name || !specialty) {
            return res.status(400).json({
                error: '이름과 진료과를 모두 입력해주세요.'
            });
        }

        const validSpecialties = ['통증', '미용', '내과', '치과'];
        if (!validSpecialties.includes(specialty)) {
            return res.status(400).json({
                error: '유효하지 않은 진료과입니다.'
            });
        }

        // 1. 기존 사용자 조회
        const { data: existingUser, error: selectError } = await supabase
            .from('users')
            .select('*')
            .eq('name', name.trim())
            .eq('specialty', specialty)
            .single();

        if (selectError && selectError.code !== 'PGRST116') {
            // PGRST116 = no rows returned (신규 사용자)
            console.error('사용자 조회 에러:', selectError);
            throw selectError;
        }

        // 2. 기존 사용자가 있으면 반환
        if (existingUser) {
            console.log(`✅ 기존 사용자 로그인: ${existingUser.name} (${existingUser.specialty})`);
            return res.status(200).json({
                success: true,
                user: existingUser,
                isNewUser: false
            });
        }

        // 3. 신규 사용자 등록
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{
                name: name.trim(),
                specialty
            }])
            .select()
            .single();

        if (insertError) {
            console.error('사용자 등록 에러:', insertError);
            throw insertError;
        }

        console.log(`🆕 신규 사용자 등록: ${newUser.name} (${newUser.specialty})`);
        return res.status(201).json({
            success: true,
            user: newUser,
            isNewUser: true
        });

    } catch (error) {
        console.error('Auth API 에러:', error);
        return res.status(500).json({
            error: '서버 오류가 발생했습니다.',
            details: error.message
        });
    }
};
