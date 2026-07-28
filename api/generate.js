/**
 * Vercel Serverless Function: api/generate.js
 */

const config = {
    api: {
        bodyParser: {
            sizeLimit: '2mb'
        }
    }
};

async function handler(req, res) {
    // CORS Header Configuration
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'POST 요청만 가능합니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ 
            success: false, 
            error: 'Vercel GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' 
        });
    }

    try {
        const { wakeTime, sleepHours, dailyTasks, userCondition } = req.body || {};

        if (!wakeTime || !dailyTasks) {
            return res.status(400).json({ success: false, error: '기상 시간과 할 일 데이터가 필요합니다.' });
        }

        const systemInstruction = `당신은 최고 권위의 수면의학 전문 코치입니다.
사용자가 입력한 기상 희망 시간(${wakeTime})과 목표 수면 시간(${sleepHours}시간)을 바탕으로 수면 시간을 확실하게 보장하는 타임라인 스케줄을 작성하세요.`;

        const userPrompt = `다음 조건에 맞춰 수면 보장 일과 스케줄을 JSON으로만 생성하세요.

[입력 정보]
- 기상 시간: ${wakeTime}
- 목표 수면 시간: ${sleepHours}시간
- 할 일:
${dailyTasks}
${userCondition ? `- 특이사항: ${userCondition}` : ''}

JSON 응답 포맷:
{
  "summary": "하루 수면 보장 플랜 요약",
  "bedtime": "HH:MM",
  "windDownTime": "HH:MM",
  "wakeTime": "${wakeTime}",
  "totalSleepHours": ${sleepHours},
  "schedule": [
    {
      "time": "시간범위",
      "title": "제목",
      "category": "분류",
      "description": "설명",
      "isWindDown": false,
      "isBedtime": false
    }
  ],
  "sleepTips": ["수면 팁 1", "수면 팁 2"]
}`;

        const basePayload = {
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: { responseMimeType: "application/json" }
        };

        let candidateModels = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

        try {
            const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (listRes.ok) {
                const listData = await listRes.json();
                if (listData.models && Array.isArray(listData.models)) {
                    const validModels = listData.models
                        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                        .map(m => m.name.replace(/^models\//, ''));
                    if (validModels.length > 0) {
                        candidateModels = Array.from(new Set([...validModels, ...candidateModels]));
                    }
                }
            }
        } catch (e) {
            console.warn('Dynamic model fetching fallback:', e.message);
        }

        let geminiRes = null;
        let lastErrorText = '';

        for (const model of candidateModels) {
            try {
                geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(basePayload)
                });

                if (geminiRes.ok) break;
                lastErrorText = await geminiRes.text();
            } catch (err) {
                lastErrorText = err.message;
            }
        }

        if (!geminiRes || !geminiRes.ok) {
            return res.status(500).json({ success: false, error: `Gemini API 호출 실패: ${lastErrorText}` });
        }

        const data = await geminiRes.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawJsonText) {
            return res.status(500).json({ success: false, error: 'AI 응답이 비어 있습니다.' });
        }

        const cleanJsonText = rawJsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsedResult = JSON.parse(cleanJsonText);

        return res.status(200).json({ success: true, data: parsedResult });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = handler;
module.exports.default = handler;
module.exports.config = config;