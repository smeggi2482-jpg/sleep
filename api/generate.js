module.exports = async (req, res) => {
    // 세션 인증 확인 로직 추가 예정
    res.status(200).json({ success: true, message: "회원 전용 데이터 연동 가능" });
};