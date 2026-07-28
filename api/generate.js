module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end();
    
    const { wakeTime, sleepHours, dailyTasks } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ success: false, error: 'API 키 누락' });
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `기상 ${wakeTime}, 수면 ${sleepHours}시간, 일과 ${dailyTasks}. 복습과 운동을 포함한 JSON 스케줄표를 생성해.` }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        const jsonText = data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
        res.status(200).json({ success: true, data: JSON.parse(jsonText) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};