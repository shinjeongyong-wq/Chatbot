const results = require('./topics_shortened.json');
const over15 = results.filter(r => r.shortened.length > 15);
console.log('15자 초과:', over15.length, '개');
console.log('');
over15.forEach((r, i) => {
    console.log((i + 1) + '. [' + r.shortened.length + '자] ' + r.shortened);
    console.log('   원본: ' + r.original);
    console.log('');
});
