/**
 * Vercel Serverless Function: api/generate.js
 * 
 * Vercel 및 Node.js 서버리스 환경 호환 handler.
 * GEMINI_API_KEY 환경변수를 통해 안전하게 Gemini API를 호출하며,
 * 기상 시각과 수면 희망 시간을 기준으로 타임라인 스케줄을 JSON으로 생성합니다.
 */

const config = {
    api: {
        bodyParser: {
            sizeLimit: '2mb'
        }
    }
};

async function handler(req, res) {
    // CORS 헤더 설정
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
        return res.status(405).json({ success: false, error: 'POST 요청만 지원합니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ 
            success: false,
            error: 'Vercel 서버 환경변수(GEMINI_API_KEY)가 설정되지 않았습니다. Vercel 대시보드 Settings > Environment Variables에서 GEMINI_API_KEY를 추가해주세요.' 
        });
    }

    try {
        const { wakeTime, sleepHours, dailyTasks, userCondition } = req.body || {};

        if (!wakeTime || !dailyTasks) {
            return res.status(400).json({ success: false, error: '기상 시간과 할 일 데이터가 부족합니다.' });
        }

        const systemInstruction = `당신은 최고 권위의 수면의학 전문의이자 AI 수면 케어 코치입니다.
사용자가 입력한 기상 희망 시간(${wakeTime})과 목표 수면 시간(${sleepHours}시간)을 바탕으로 수면 시간을 확실하게 보장하는 타임라인 스케줄을 작성하세요.`;

        const userPrompt = `다음 사용자의 조건에 맞는 '수면 시간 보장 일과 스케줄'을 생성해 주세요.

[사용자 입력 정보]
- 목표 기상 시간: ${wakeTime}
- 목표 수면 시간: ${sleepHours}시간
- 오늘 할 일 및 일정:
${dailyTasks}
${userCondition ? `- 사용자 피로도/특이사항: ${userCondition}` : ''}

반드시 다음 예시와 동일한 규격의 JSON 형식으로만 응답하세요:
{
  "summary": "하루 수면 보장 플랜 한줄 요약",
  "bedtime": "HH:MM",
  "windDownTime": "HH:MM",
  "wakeTime": "${wakeTime}",
  "totalSleepHours": ${sleepHours},
  "schedule": [
    {
      "time": "HH:MM - HH:MM",
      "title": "일정 이름",
      "category": "업무/운동/식사/휴식/수면준비/취침 등",
      "description": "일정에 대한 상세 팁",
      "isWindDown": false,
      "isBedtime": false
    },
    {
      "time": "22:00 - 22:30",
      "title": "수면 준비 (전자기기 OFF, 암막 조성)",
      "category": "수면준비",
      "description": "멜라토닌 분비를 돕기 위한 준비 시간",
      "isWindDown": true,
      "isBedtime": false
    },
    {
      "time": "22:30",
      "title": "목표 취침 및 숙면 시작",
      "category": "수면",
      "description": "알람과 함께 취침에 듭니다.",
      "isWindDown": false,
      "isBedtime": true
    }
  ],
  "sleepTips": [
    "숙면을 위한 AI 코치 가이드 1",
    "숙면을 위한 AI 코치 가이드 2"
  ]
}`;

        const basePayload = {
            contents: [
                {
                    role: "user",
                    parts: [{ text: userPrompt }]
                }
            ],
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        let candidateModels = [
            'gemini-1.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-pro'
        ];

        try {
            const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const listRes = await fetch(listModelsUrl);
            if (listRes.ok) {
                const listData = await listRes.json();
                if (listData.models && Array.isArray(listData.models)) {
                    const validDynamicModels = listData.models
                        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                        .map(m => m.name.replace(/^models\//, ''));

                    if (validDynamicModels.length > 0) {
                        candidateModels = Array.from(new Set([...validDynamicModels, ...candidateModels]));
                    }
                }
            }
        } catch (listErr) {
            console.warn('동적 모델 목록 조회 실패, 기본 후보군 사용:', listErr.message);
        }

        let geminiRes = null;
        let lastErrorText = '';

        for (const model of candidateModels) {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            
            try {
                geminiRes = await fetch(apiUrl, {
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
            return res.status(500).json({ 
                success: false,
                error: `Gemini API 호출 실패: ${lastErrorText || 'Google AI API 서버 응답 없음'}` 
            });
        }

        const data = await geminiRes.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawJsonText) {
            return res.status(500).json({ success: false, error: 'AI 응답 결과를 생성하지 못했습니다.' });
        }

        const cleanJsonText = rawJsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsedResult = JSON.parse(cleanJsonText);

        return res.status(200).json({
            success: true,
            data: parsedResult
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false,
            error: error.message || '서버 내부 처리 중 오류가 발생했습니다.' 
        });
    }
}

module.exports = handler;
module.exports.default = handler;
module.exports.config = config;