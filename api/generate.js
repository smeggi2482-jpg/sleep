/**
 * Vercel Serverless Function: api/generate.js
 * AI가 수면 보장 타임라인과 함께 복습/운동 시간을 배치합니다.
 */

const config = {
    api: {
        bodyParser: {
            sizeLimit: '2mb'
        }
    }
};

async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST 요청만 가능합니다.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });

    try {
        const { wakeTime, sleepHours, dailyTasks, userCondition } = req.body || {};
        
        const systemInstruction = `당신은 최고 권위의 수면의학 전문 코치입니다. 
사용자의 기상 시간(${wakeTime})과 목표 수면 시간(${sleepHours}시간)을 바탕으로 수면 시간을 보장하는 스케줄을 만드세요.
반드시 일정 중간에 '가벼운 운동/스트레칭'과 '오늘 일과 복습/하루 정리' 시간을 포함하여 일과 효율과 피로 해소를 고려하십시오.`;

        const userPrompt = `다음 조건에 맞춰 수면 보장 일과 스케줄을 JSON으로만 생성하세요.
- 기상 시간: ${wakeTime}
- 목표 수면 시간: ${sleepHours}시간
- 할 일: ${dailyTasks}
- 특이사항: ${userCondition || '없음'}

JSON 응답 포맷 (모든 항목 반드시 채울 것):
{
  "summary": "하루 수면 보장 및 건강 증진 플랜",
  "bedtime": "HH:MM",
  "windDownTime": "HH:MM",
  "wakeTime": "${wakeTime}",
  "totalSleepHours": ${sleepHours},
  "schedule": [
    { "time": "HH:MM", "title": "제목", "category": "운동" 또는 "복습" 또는 "일과", "description": "설명", "isWindDown": false, "isBedtime": false }
  ],
  "sleepTips": ["수면 팁 1", "수면 팁 2"]
}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        const jsonText = data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
        return res.status(200).json({ success: true, data: JSON.parse(jsonText) });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = handler;
module.exports.config = config;