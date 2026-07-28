module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end();
    const { wakeTime, dailyTasks } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ success: false, error: 'API 키 누락' });

    try {
        // AI 스케줄 생성 로직 (생략: 기존과 동일)
        res.status(200).json({ success: true, data: { schedule: [] } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};