// Node.js 환경에서 동작하는 Vercel 서버리스 API 핸들러 함수
export default async function handler(req, res) {
    // 브라우저 간 교차 출처 리소스 공유(CORS) 허용 헤더 설정
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    // 클라이언트의 쿼리 스트링에서 sido(시도 이름) 추출 (기본값: '서울')
    const { sido = "서울" } = req.query;

    // 환경변수(Vercel 환경변수 또는 .env.local)에서 에어코리아 인증키 가져오기
    const serviceKey = process.env.AIRKOREA_KEY;

    // 인증키가 환경변수에 설정되지 않았을 경우 오류 응답 반환
    if (!serviceKey) {
        return res.status(500).json({
            error: "서버에 AIRKOREA_KEY 환경변수가 설정되어 있지 않습니다. Vercel 또는 .env.local 설정을 확인해주세요."
        });
    }

    // Decoding 키이므로 URL 파라미터로 안전하게 전달하기 위해 encodeURIComponent 처리
    const encodedKey = encodeURIComponent(serviceKey.trim());
    // 시도 이름도 한글이므로 안전하게 URI 인코딩 처리
    const encodedSido = encodeURIComponent(sido);

    // 에어코리아 공공데이터 API 최종 요청 주소 조합
    const targetUrl = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodedKey}&returnType=json&numOfRows=100&pageNo=1&sidoName=${encodedSido}&ver=1.3`;

    try {
        // 공공데이터포털 서버로 외부 GET 요청 전송
        const response = await fetch(targetUrl);

        // 응답 본문 데이터를 텍스트 형태로 먼저 수신
        const responseText = await response.text();

        // 수신된 텍스트를 JSON 형식으로 파싱 시도
        let jsonData;
        try {
            jsonData = JSON.parse(responseText);
        } catch (parseError) {
            // JSON 파싱 실패(XML 에러 메시지 반환 등) 시 인증키/요청값 오류 메시지 반환
            return res.status(400).json({
                error: "인증키 또는 요청값을 확인해주세요. (공공데이터포털에서 유효하지 않은 응답이 도착했습니다)"
            });
        }

        // 응답 객체 내부의 resultCode 추출 (정상 코드는 "00")
        const resultCode = jsonData?.response?.header?.resultCode;
        const resultMsg = jsonData?.response?.header?.resultMsg || "정상 처리되지 않았습니다.";

        // resultCode가 성공("00")이 아닌 경우 한국어 안내 오류 반환
        if (resultCode && resultCode !== "00") {
            return res.status(400).json({
                error: `공공데이터포털 오류 [코드: ${resultCode}]: ${resultMsg} - 인증키 또는 요청값을 확인해주세요.`
            });
        }

        // 정상 데이터인 경우 클라이언트에 JSON 형태로 그대로 전달
        return res.status(200).json(jsonData);

    } catch (error) {
        // 네트워크 연결 또는 서버 처리 중 예외 발생 시 에러 응답 반환
        return res.status(500).json({
            error: `서버 내부 오류가 발생했습니다: ${error.message}`
        });
    }
}

