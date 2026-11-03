// Vercel 서버리스 프록시 API 엔드포인트 주소 (/api/dust)
const API_URL = "/api/dust";

// 기본 선택 설정: 숭실대학교가 위치한 서울특별시 동작구
const DEFAULT_SIDO = "서울";
const DEFAULT_STATION = "동작구";

// DOM 엘리먼트 가져오기
const sidoSelect = document.getElementById("sidoSelect");
const stationSelect = document.getElementById("stationSelect");

// 공기 신호등 대형 카드 및 내부 엘리먼트들
const signalCard = document.getElementById("signalCard");
const currentRegionName = document.getElementById("currentRegionName");
const signalEmoji = document.getElementById("signalEmoji");
const signalText = document.getElementById("signalText");
const averageValue = document.getElementById("averageValue");
const actionTip = document.getElementById("actionTip");
const latestTime = document.getElementById("latestTime");

// 상태 메시지 및 측정소 카드 그리드 컨테이너
const statusMessage = document.getElementById("statusMessage");
const stationList = document.getElementById("stationList");

// 현재 조회된 측정소 데이터 배열 및 선택된 측정소 관리 변수
let currentItems = [];
let selectedStationName = DEFAULT_STATION;

// Chart.js 인스턴스를 저장할 전역 변수
let dustChartInstance = null;

// 대기오염 등급(1~4)에 대응하는 스타일 클래스, 이모지, 텍스트 및 차트 색상 매핑 객체
const GRADE_MAP = {
    "1": {
        className: "card-good",
        signalClass: "signal-good",
        emoji: "🔵",
        text: "좋음",
        chartColor: "rgba(59, 130, 246, 0.8)",
        chartBorder: "#3b82f6"
    },
    "2": {
        className: "card-normal",
        signalClass: "signal-normal",
        emoji: "🟢",
        text: "보통",
        chartColor: "rgba(16, 185, 129, 0.8)",
        chartBorder: "#10b981"
    },
    "3": {
        className: "card-bad",
        signalClass: "signal-bad",
        emoji: "🟠",
        text: "나쁨",
        chartColor: "rgba(249, 115, 22, 0.8)",
        chartBorder: "#f97316"
    },
    "4": {
        className: "card-very-bad",
        signalClass: "signal-very-bad",
        emoji: "🔴",
        text: "매우나쁨",
        chartColor: "rgba(239, 68, 68, 0.8)",
        chartBorder: "#ef4444"
    }
};

// 미세먼지 수치 데이터를 화면 표시용 텍스트로 변환하는 함수
function formatDustValue(val) {
    // 값이 없거나 "-" 인 결측치인 경우 "측정 안 됨" 반환
    if (!val || val === "-" || String(val).trim() === "") {
        return "측정 안 됨";
    }
    // 유효한 수치인 경우 단위(㎍/㎥) 부착
    return `${val} ㎍/㎥`;
}

// "2026-11-03 12:00" 형태의 API 측정 시각을 "2026년 11월 3일 12시 기준" 한국어로 변환하는 함수
function formatKoreanDateTime(timeStr) {
    if (!timeStr) return "측정 시각 정보 없음";
    const match = timeStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/);
    if (match) {
        const [, year, month, day, hour] = match;
        return `${year}년 ${Number(month)}월 ${Number(day)}일 ${Number(hour)}시 기준`;
    }
    return `${timeStr} 기준`;
}

// 개별 측정소의 pm10Grade 값에 맞는 등급 정보 객체 반환 함수
function getStationGradeInfo(grade) {
    if (grade && GRADE_MAP[grade]) {
        return GRADE_MAP[grade];
    }
    return {
        className: "card-unknown",
        signalClass: "signal-unknown",
        emoji: "⚪",
        text: "정보 없음",
        chartColor: "rgba(148, 163, 184, 0.8)",
        chartBorder: "#94a3b8"
    };
}

// 수치를 바탕으로 신호등 대표 등급 및 안내 문구 반환 함수
function determineGradeFromValue(val) {
    if (val === null || val === undefined || isNaN(val)) {
        return {
            signalClass: "signal-unknown",
            emoji: "⚪",
            text: "정보 없음",
            tip: "실시간 대기오염 정보를 집계하는 중입니다 ⏳"
        };
    }
    // 0 ~ 30 좋음
    if (val <= 30) {
        return {
            signalClass: "signal-good",
            emoji: "🔵",
            text: "좋음",
            tip: "공기가 깨끗하고 쾌적해요! 나들이하기 좋아요 🌿"
        };
    }
    // 31 ~ 80 보통
    if (val <= 80) {
        return {
            signalClass: "signal-normal",
            emoji: "🟢",
            text: "보통",
            tip: "공기 상태가 무난한 날이에요. 실외 활동하기 괜찮아요 😊"
        };
    }
    // 81 ~ 150 나쁨 (마스크 권장)
    if (val <= 150) {
        return {
            signalClass: "signal-bad",
            emoji: "🟠",
            text: "나쁨",
            tip: "외출 시 마스크를 챙기세요 😷"
        };
    }
    // 151 이상 매우나쁨 (마스크 필수)
    return {
        signalClass: "signal-very-bad",
        emoji: "🔴",
        text: "매우나쁨",
        tip: "외출 시 마스크를 챙기세요 😷 (야외 활동을 자제해 주세요)"
    };
}

// 데이터 로딩 중 화면 표시 상태를 설정하는 함수
function showLoadingState(regionText) {
    signalCard.className = "signal-card signal-loading";
    currentRegionName.textContent = regionText;
    signalEmoji.textContent = "⏳";
    signalText.textContent = "불러오는 중...";
    averageValue.textContent = "-";
    actionTip.textContent = `${regionText}의 실시간 대기오염 데이터를 불러오고 있습니다...`;
    latestTime.textContent = "-";

    statusMessage.style.display = "block";
    statusMessage.textContent = "최신 측정소 데이터를 불러오는 중입니다...";
    stationList.innerHTML = "";
}

// 측정소 목록 드롭다운 옵션들을 동적으로 채우는 함수
function populateStationSelect(items, sidoName) {
    stationSelect.innerHTML = "";

    // 1. 전체 평균 옵션 추가
    const allOption = document.createElement("option");
    allOption.value = "__ALL__";
    allOption.textContent = `${sidoName} 전체 평균`;
    stationSelect.appendChild(allOption);

    let hasDefaultStation = false;

    // 2. 각 측정소별 옵션 추가
    items.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.stationName;

        // 동작구 측정소인 경우 숭실대학교 위치 표기
        if (sidoName === "서울" && item.stationName === "동작구") {
            option.textContent = "동작구 (숭실대학교 🏫)";
            hasDefaultStation = true;
        } else {
            option.textContent = item.stationName;
        }
        stationSelect.appendChild(option);
    });

    // 기본 선택값 설정 (서울일 경우 동작구(숭실대) 자동 선택)
    if (sidoName === "서울" && hasDefaultStation && selectedStationName === "동작구") {
        stationSelect.value = "동작구";
    } else if (items.length > 0 && selectedStationName !== "__ALL__") {
        // 이미 선택된 측정소가 있으면 유지, 없으면 전체 평균 선택
        const exists = items.some(item => item.stationName === selectedStationName);
        stationSelect.value = exists ? selectedStationName : "__ALL__";
        selectedStationName = stationSelect.value;
    } else {
        stationSelect.value = "__ALL__";
        selectedStationName = "__ALL__";
    }
}

// 상단 공기 신호등(이모지, 대표상태, 수치, 한줄 안내문구, 기준시각) 갱신 함수
function updateSignalCard(items, sidoName, targetStation) {
    // 1. 특정 측정소가 선택된 경우
    if (targetStation && targetStation !== "__ALL__") {
        const stationItem = items.find((item) => item.stationName === targetStation);

        if (stationItem) {
            // 숭실대학교(동작구)인 경우 친절한 명칭 부여
            const displayName = (sidoName === "서울" && targetStation === "동작구")
                ? "숭실대학교 (동작구)"
                : `${sidoName} ${targetStation}`;

            currentRegionName.textContent = displayName;

            const dustVal = stationItem.pm10Value;
            if (dustVal && dustVal !== "-" && !isNaN(Number(dustVal))) {
                const numVal = Number(dustVal);
                const gradeInfo = determineGradeFromValue(numVal);

                signalCard.className = `signal-card ${gradeInfo.signalClass}`;
                signalEmoji.textContent = gradeInfo.emoji;
                signalText.textContent = gradeInfo.text;
                averageValue.textContent = numVal;
                actionTip.textContent = gradeInfo.tip;
            } else {
                signalCard.className = "signal-card signal-unknown";
                signalEmoji.textContent = "⚪";
                signalText.textContent = "측정 안 됨";
                averageValue.textContent = "-";
                actionTip.textContent = "해당 측정소의 점검 또는 통신 장애로 측정값이 없습니다.";
            }

            latestTime.textContent = formatKoreanDateTime(stationItem.dataTime);
            return;
        }
    }

    // 2. 전체 평균이 선택되었거나 해당 측정소를 못 찾은 경우
    currentRegionName.textContent = `${sidoName} 전체 평균`;

    let sum = 0;
    let count = 0;
    let firstValidTime = null;

    items.forEach((item) => {
        const val = item.pm10Value;
        if (val && val !== "-" && !isNaN(Number(val))) {
            sum += Number(val);
            count += 1;
        }
        if (!firstValidTime && item.dataTime) {
            firstValidTime = item.dataTime;
        }
    });

    if (count > 0) {
        const avg = Math.round(sum / count);
        const gradeInfo = determineGradeFromValue(avg);

        signalCard.className = `signal-card ${gradeInfo.signalClass}`;
        signalEmoji.textContent = gradeInfo.emoji;
        signalText.textContent = gradeInfo.text;
        averageValue.textContent = avg;
        actionTip.textContent = gradeInfo.tip;
    } else {
        signalCard.className = "signal-card signal-unknown";
        signalEmoji.textContent = "⚪";
        signalText.textContent = "측정 안 됨";
        averageValue.textContent = "-";
        actionTip.textContent = "현재 유효한 미세먼지 측정값이 없습니다.";
    }

    latestTime.textContent = formatKoreanDateTime(firstValidTime);
}

// 미세먼지 수치가 높은 순으로 상위 10개 측정소 가로 막대그래프를 그리는 함수
function updateChart(items) {
    const canvas = document.getElementById("dustChart");
    if (!canvas) return;

    // 결측치 제외 및 유효한 수치 필터링
    const validStations = items.filter((item) => {
        const val = item.pm10Value;
        return val && val !== "-" && !isNaN(Number(val));
    });

    // 높은 순 정렬
    validStations.sort((a, b) => Number(b.pm10Value) - Number(a.pm10Value));

    // 상위 10개 추출
    const top10 = validStations.slice(0, 10);

    const labels = top10.map((item) => {
        if (item.stationName === "동작구") {
            return "동작구 (숭실대 🏫)";
        }
        return item.stationName || "측정소";
    });
    const dataValues = top10.map((item) => Number(item.pm10Value));
    const backgroundColors = [];
    const borderColors = [];

    top10.forEach((item) => {
        const gradeInfo = getStationGradeInfo(item.pm10Grade);
        backgroundColors.push(gradeInfo.chartColor);
        borderColors.push(gradeInfo.chartBorder);
    });

    if (dustChartInstance) {
        dustChartInstance.destroy();
    }

    const ctx = canvas.getContext("2d");
    dustChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "미세먼지 (PM10)",
                data: dataValues,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 2,
                borderRadius: 8,
                barPercentage: 0.7
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `미세먼지: ${context.raw} ㎍/㎥`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: "#f1f5f9" },
                    title: {
                        display: true,
                        text: "농도 (㎍/㎥)",
                        color: "#94a3b8",
                        font: { size: 11, weight: "bold" }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: "#334155",
                        font: { size: 12, weight: "bold" }
                    }
                }
            }
        }
    });
}

// 측정소별 은은한 카드 목록을 화면에 동적으로 생성하는 함수
function renderStations(items, sidoName) {
    stationList.innerHTML = "";

    // 숭실대학교(동작구)가 있는 경우 카드를 가장 맨 앞으로 정렬
    const sortedItems = [...items].sort((a, b) => {
        if (sidoName === "서울") {
            if (a.stationName === "동작구") return -1;
            if (b.stationName === "동작구") return 1;
        }
        return 0;
    });

    sortedItems.forEach((item) => {
        const gradeInfo = getStationGradeInfo(item.pm10Grade);
        const isSoongsil = (sidoName === "서울" && item.stationName === "동작구");

        const card = document.createElement("div");
        card.className = `station-card ${gradeInfo.className} ${isSoongsil ? "is-soongsil" : ""}`;

        // 숭실대학교 하이라이트 배지 추가
        const badgeHtml = isSoongsil ? `<div class="soongsil-badge">🏫 숭실대학교 위치</div>` : "";

        card.innerHTML = `
            ${badgeHtml}
            <div class="card-header">
                <span class="station-name">${item.stationName || "측정소"}</span>
                <span class="grade-text">${gradeInfo.emoji} ${gradeInfo.text}</span>
            </div>
            <div class="card-body">
                <div class="dust-row">
                    <span class="dust-label">미세먼지(PM10)</span>
                    <span class="dust-value">${formatDustValue(item.pm10Value)}</span>
                </div>
                <div class="dust-row">
                    <span class="dust-label">초미세먼지(PM2.5)</span>
                    <span class="dust-value">${formatDustValue(item.pm25Value)}</span>
                </div>
            </div>
            <div class="card-footer">
                ${formatKoreanDateTime(item.dataTime)}
            </div>
        `;

        stationList.appendChild(card);
    });
}

// 선택된 시도의 실시간 대기 데이터를 서버리스 API로부터 조회하는 비동기 함수
async function fetchAirQualityData(sidoName) {
    const loadingTargetText = (sidoName === "서울" && selectedStationName === "동작구")
        ? "숭실대학교 (동작구)"
        : `${sidoName} 대기 정보`;

    showLoadingState(loadingTargetText);

    try {
        // 자체 Vercel 서버리스 API 호출 (/api/dust?sido=...)
        const queryParams = new URLSearchParams({ sido: sidoName });
        const response = await fetch(`${API_URL}?${queryParams.toString()}`);

        // HTTP 상태 코드가 정상이 아닐 경우 (404 Not Found 등)
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("서버 API(/api/dust)를 찾을 수 없습니다. (404 오류: 깃허브에 api/dust.js 파일이 올바르게 포함되었는지 확인해 주세요)");
            }
            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                throw new Error(errorJson.error || `서버 오류 (${response.status})`);
            } catch {
                throw new Error(`서버 응답 오류 (상태 코드: ${response.status})`);
            }
        }

        // 응답 텍스트를 안전하게 수신 후 JSON 파싱
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error("서버 응답이 올바른 JSON 형식이 아닙니다. (API 주소 또는 Vercel 설정을 확인해 주세요)");
        }

        if (data.error) {
            throw new Error(data.error);
        }

        const items = data?.response?.body?.items;

        if (!items || items.length === 0) {
            statusMessage.style.display = "block";
            statusMessage.textContent = "해당 지역에 등록된 측정소 데이터가 없습니다.";
            actionTip.textContent = "조회된 측정 데이터가 없습니다.";
            signalEmoji.textContent = "⚪";
            signalText.textContent = "데이터 없음";
            return;
        }

        currentItems = items;
        statusMessage.style.display = "none";

        // 측정소 드롭다운 채우기 (서울일 경우 동작구(숭실대) 자동 선택)
        populateStationSelect(items, sidoName);

        // 1. 상단 공기 신호등 갱신 (선택된 측정소 또는 전체 평균)
        updateSignalCard(items, sidoName, selectedStationName);

        // 2. 가로 막대그래프 갱신
        updateChart(items);

        // 3. 측정소별 카드 목록 렌더링
        renderStations(items, sidoName);

    } catch (error) {
        console.error("데이터 조회 실패:", error);
        signalCard.className = "signal-card signal-unknown";
        signalEmoji.textContent = "⚠️";
        signalText.textContent = "오류 발생";
        actionTip.textContent = error.message;
        statusMessage.style.display = "block";
        statusMessage.innerHTML = `데이터를 가져오지 못했습니다.<br><span style="color:#ef4444; font-weight:700;">${error.message}</span>`;
    }
}

// 시도 드롭다운 변경 이벤트
sidoSelect.addEventListener("change", (e) => {
    const newSido = e.target.value;
    if (newSido === "서울") {
        selectedStationName = "동작구";
    } else {
        selectedStationName = "__ALL__";
    }
    fetchAirQualityData(newSido);
});

// 세부 측정소 드롭다운 변경 이벤트
stationSelect.addEventListener("change", (e) => {
    selectedStationName = e.target.value;
    updateSignalCard(currentItems, sidoSelect.value, selectedStationName);
});

// 페이지 첫 진입 시 실행: 기본값 서울 / 숭실대학교(동작구) 자동 선택
window.addEventListener("DOMContentLoaded", () => {
    selectedStationName = DEFAULT_STATION;
    sidoSelect.value = DEFAULT_SIDO;
    fetchAirQualityData(DEFAULT_SIDO);
});
