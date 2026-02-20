
const fs = require('fs');

// Mock data
const anchorTopics = [
    { id: 1, question: '피코레이저 설명', category: '미용', subCategory: '장비' },
    { id: 2, question: '인테리어 업체 추천해주세요', category: '인테리어', subCategory: '기본' },
    { id: 3, question: '통증 클리닉 개원 절차', category: '개원', subCategory: '로드맵' }
];

const chatMemory = {
    usedTopics: [],
    addUsedTopic(topic) {
        if (!this.usedTopics.includes(topic)) {
            this.usedTopics.push(topic);
        }
    }
};

// The function to test (copied from script.js)
function findRelatedAnchorTopics(userMessage, count = 3, includeUsed = false) {
    if (!anchorTopics || anchorTopics.length === 0) return [];
    const message = userMessage.toLowerCase();
    const used = chatMemory.usedTopics || [];

    const scored = anchorTopics
        .filter(topic => includeUsed || !used.includes(topic.question))
        .map(topic => {
            let score = 0;
            const question = topic.question.toLowerCase();
            if (message.includes(question)) score += 10; // Exact match bonus
            const words = question.split(' ');
            words.forEach(w => { if (message.includes(w)) score += 1; });
            return { question: topic.question, score };
        });

    return scored
        .filter(t => t.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(t => t.question);
}

console.log('--- Mock Test Start ---');

// 1. User asks a question
const userQuery = '피코레이저 설명해줘';
console.log('User:', userQuery);

// 2. Identify and record topic
const recorded = findRelatedAnchorTopics(userQuery, 1, true);
if (recorded.length > 0) {
    console.log('Matched for recording:', recorded[0]);
    chatMemory.addUsedTopic(recorded[0]);
}

console.log('chatMemory.usedTopics:', chatMemory.usedTopics);

// 3. Get next recommendations for another query
console.log('\n--- Second turn ---');
const userQuery2 = '인테리어랑 피코레이저 궁금해';
console.log('User:', userQuery2);

// Filtered recommendations (should not include 피코레이저)
const recommended = findRelatedAnchorTopics(userQuery2, 3, false);
console.log('Next recommendations (Filtered):', recommended);

// Final Check
const hasPico = recommended.includes('피코레이저 설명');
const hasInterior = recommended.includes('인테리어 업체 추천해주세요');

console.log('Does it have "피코레이저 설명"?', hasPico ? '❌ YES (Fail)' : '✅ NO (Success)');
console.log('Does it have "인테리어 업체 추천해주세요"?', hasInterior ? '✅ YES (Success)' : '❌ NO (Fail)');

if (!hasPico && hasInterior) {
    console.log('\n--- ALL TESTS PASSED ---');
} else {
    console.log('\n--- TEST FAILED ---');
    process.exit(1);
}
