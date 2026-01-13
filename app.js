// VERSION CONTROL: 3.9 (Multi-Speaker Dynamic Detection)
console.log("APP VERSION: 3.9 - Multi-Speaker Active");

// --- 1. CRITICAL RECOVERY LAYER (Move to top, No dependencies) ---
window.closeReport = () => {
    const reportOverlay = document.getElementById('report-overlay');
    if (reportOverlay) {
        reportOverlay.style.display = 'none';
        reportOverlay.classList.add('hidden');
    }
};

window.copyReport = () => {
    const reportBody = document.getElementById('report-body');
    if (!reportBody) return;
    const text = reportBody.innerText;
    if (text.includes("보고서를 작성하고 있습니다") || text.includes("작성 중")) {
        alert("⚠️ 아직 보고서가 완성되지 않았습니다. 잠시만 기다려주세요!");
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        alert('성공! 보고서가 클립보드에 복사되었습니다.\n이제 삼성노트나 카톡에 [붙여넣기] 하세요!');
        window.closeReport();
    });
};

window.forceAppReload = () => {
    if (confirm('앱을 강제로 새로고침하시겠습니까?\n(입력된 데이터가 초기화될 수 있습니다.)')) {
        const freshUrl = window.location.pathname + '?v=' + new Date().getTime();
        window.location.replace(freshUrl);
    }
};

window.panicReset = () => {
    if (confirm('🚨 모든 설정을 초기화하고 앱을 처음 상태로 되돌리시겠습니까?\n(저장된 API 키도 삭제됩니다.)')) {
        localStorage.clear();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let r of registrations) r.unregister();
            });
        }
        window.location.reload(true);
    }
};

// --- 2. DOM INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyze-btn');
    const appStatus = document.getElementById('app-status');
    const moodStatus = document.getElementById('mood-status');
    const intentStatus = document.getElementById('intent-status');
    const actionSuggestion = document.getElementById('action-suggestion');
    const ambientOverlay = document.getElementById('ambient-overlay');
    const textInput = document.getElementById('text-input');
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const reportOverlay = document.getElementById('report-overlay');
    const reportBody = document.getElementById('report-body');
    const flowContainer = document.getElementById('flow-container');

    if (appStatus) appStatus.textContent = "✅ 앱 버전 3.9 로드 완료 (다중 화자 구분 패치)";

    let isAnalyzing = false;
    let recognition = null;
    let GEMINI_API_KEY = localStorage.getItem('GEMINI_API_KEY') || '';
    let wakeLock = null;
    let conversationHistory = [];
    let lastTopic = ""; // Track the last topic

    if (GEMINI_API_KEY && apiKeyInput) {
        apiKeyInput.value = GEMINI_API_KEY;
    }

    if (settingsToggle) {
        settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsPanel.classList.toggle('hidden');
        });
    }

    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', () => {
            GEMINI_API_KEY = apiKeyInput.value.trim();
            localStorage.setItem('GEMINI_API_KEY', GEMINI_API_KEY);
            alert('API 키가 안전하게 저장되었습니다.');
            settingsPanel.classList.add('hidden');
        });
    }

    // --- Speech Recognition ---
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ko-KR';

        recognition.onstart = () => {
            appStatus.innerHTML = "🎙️ <span class='pulse'>실시간 분석 중... 말씀해 주세요.</span>";
            analyzeBtn.innerHTML = '<span class="btn-icon">🛑</span> <span>분석 중지</span>';
            analyzeBtn.style.background = 'linear-gradient(135deg, #ef4444, #991b1b)';
            requestWakeLock();
        };

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript;
            }
            appStatus.innerHTML = `👂 <span style="color: #cffafe;">청취 중: ${transcript}</span>`;
            if (event.results[event.results.length - 1].isFinal) {
                // Hide raw transcript from status bar and only show a listening indicator
                appStatus.innerHTML = "👂 <span style='color: #cffafe;'>경청 완료, 분석 중...</span>";
                triggerAnalysis(transcript);
            }
        };

        recognition.onerror = (event) => {
            console.error("Recognition Error:", event.error);
            if (event.error === 'not-allowed') {
                appStatus.innerHTML = "❌ <span style='color:#f87171'>마이크 권한을 허용해주세요.</span>";
            }
        };

        recognition.onend = () => {
            if (isAnalyzing) {
                try { recognition.start(); } catch (e) { }
            }
        };
    }

    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) { }
    }

    function releaseWakeLock() {
        if (wakeLock !== null) {
            wakeLock.release().then(() => { wakeLock = null; });
        }
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            if (isAnalyzing) {
                stopAnalysis();
            } else {
                isAnalyzing = true;
                conversationHistory = [];
                try { if (recognition) recognition.start(); } catch (e) { }
                updateUI('recording', '경청 중...', '맥락 분석을 시작합니다.');
            }
        });
    }

    async function stopAnalysis() {
        isAnalyzing = false;
        releaseWakeLock();
        if (recognition) try { recognition.stop(); } catch (e) { }
        appStatus.textContent = "분석이 종료되었습니다.";
        analyzeBtn.innerHTML = '<span class="btn-icon">🎙️</span> <span>분석 시작</span>';
        analyzeBtn.style.background = '';
        ambientOverlay.style.background = `radial-gradient(circle at center, #6e45e2, transparent 70%)`;
        if (conversationHistory.length > 2 && GEMINI_API_KEY) {
            generateFinalReport();
        }
    }

    function updateUI(themeKey, intentText, suggestionText) {
        const ANALYSIS_THEMES = {
            recording: { mood: "분석 활성화", color: "#ef4444" },
            positive: { mood: "긍정적/우호적", color: "#10b981" },
            negative: { mood: "부정적/긴장", color: "#f59e0b" },
            neutral: { mood: "일상적 맥락", color: "#6e45e2" }
        };
        const theme = ANALYSIS_THEMES[themeKey] || ANALYSIS_THEMES.neutral;
        moodStatus.textContent = theme.mood;
        intentStatus.textContent = intentText;
        actionSuggestion.textContent = suggestionText;
        ambientOverlay.style.background = `radial-gradient(circle at center, ${theme.color}, transparent 70%)`;

        // Hide full transcript from status bar if it's not a generic recording pulse
        if (themeKey !== 'recording') {
            appStatus.innerHTML = "✅ 분석 완료";
        }
    }

    function addFlowBubble(speaker, summary, speakerId = 0) {
        if (!flowContainer) return;

        // Remove empty state message if exists
        const emptyMsg = flowContainer.querySelector('.empty-flow');
        if (emptyMsg) emptyMsg.remove();

        const bubble = document.createElement('div');
        const isMe = speaker === 'me' || speaker === '나';
        bubble.className = `chat-bubble ${isMe ? 'me' : 'other'}`;

        // Add specific color class for other speakers
        if (!isMe && speakerId > 0) {
            bubble.classList.add(`p${(speakerId % 5) || 5}`);
        }

        const speakerLabel = document.createElement('span');
        speakerLabel.className = 'bubble-speaker';
        // 한글 패치: me/other가 그대로 출력되지 않도록 변환
        let displayName = speaker;
        if (speaker === 'me') displayName = '나';
        else if (speaker === 'other') displayName = '상대방';
        
        speakerLabel.textContent = displayName;

        const content = document.createElement('div');
        content.textContent = summary;

        bubble.appendChild(speakerLabel);
        bubble.appendChild(content);
        flowContainer.appendChild(bubble);

        // Scroll to bottom
        flowContainer.scrollTop = flowContainer.scrollHeight;
    }

    function addTopicDivider(topicText) {
        if (!flowContainer) return;

        const divider = document.createElement('div');
        divider.className = 'topic-divider';
        divider.innerHTML = `<span>📌 주제 변경: ${topicText}</span>`;
        
        flowContainer.appendChild(divider);
        flowContainer.scrollTop = flowContainer.scrollHeight;
    }

    async function triggerAnalysis(text) {
        if (!text.trim() || !GEMINI_API_KEY) return;
        try {
            appStatus.innerHTML = "🤖 <span class='pulse'>박사님이 집중 분석 중...</span>";
            const context = conversationHistory.slice(-5).map(h => `${h.speaker}: ${h.text}`).join(' | ');
            const response = await callGemini(text, context);
            if (response) {
                // Topic Change Detection
                if (response.currentTopic && lastTopic && response.currentTopic !== lastTopic) {
                     addTopicDivider(response.currentTopic);
                }
                if (response.currentTopic) {
                    lastTopic = response.currentTopic;
                }

                // Save to history with speaker info
                conversationHistory.push({
                    speaker: response.speaker || 'other',
                    text: text,
                    summary: response.summary || text
                });
                if (conversationHistory.length > 50) conversationHistory.shift();

                updateUI(response.mood, response.intent, response.suggestion);
                // Modified: Show actual text instead of summary
                addFlowBubble(response.speakerTag || response.speaker, text, response.speakerId || 0);
            }
        } catch (error) {
            appStatus.textContent = "⚠️ 분석 오류 (전체 모델 실패)";
        }
    }

    async function callGemini(text, context = "") {
        const endpoints = [
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`
        ];
        const prompt = `당신은 실시간 대화 분석가입니다. 아래 대화를 분석하여 반드시 '한국어'로만 답변하세요.
        당신은 오디오 분석 없이 오직 '텍스트'만으로 여러 명의 대화를 구분해야 합니다.
        [최근 흐름]: ${context}
        [현재 문장]: "${text}"
        [현재 문장]: "${text}"
        상대방의 'mood', 'intent', 'suggestion', 'speaker', 'speakerTag', 'speakerId', 'summary', 'currentTopic'을 JSON으로만 답변하세요.
        - mood: 'positive', 'negative', 'neutral' 중 하나
        - intent: 상대방의 숨은 의도나 상태 (한국어 1문장)
        - suggestion: 내가 취할 수 있는 최선의 행동 (한국어 1문장)
        - speaker: 'me' (나) 또는 'other' (다른 모든 사람)
        - speakerTag: 이 문장을 말한 사람의 호칭. 문맥상 나이면 '나', 다른 사람이면 '참가자 1', '참가자 2' 등으로 구분하세요. 만약 누군가 이름을 부른다면 그 이름을 사용해도 좋습니다.
        - speakerId: 화자별 고유 번호 (나=0, 참가자1=1, 참가자2=2...). 새로운 화자가 등장하면 다음 번호를 부여하세요.
        - summary: 이 문장의 핵심 내용을 아주 짧게 요약 (한국어 1문장)
        - currentTopic: 현재 대화의 핵심 주제 (예: '점심 메뉴 결정', '날씨 이야기'). 이전과 주제가 같으면 동일하게, 확실히 바뀌었으면 새로운 주제를 적으세요.
        형식: {"mood": "...", "intent": "...", "suggestion": "...", "speaker": "...", "speakerTag": "...", "speakerId": 0, "summary": "...", "currentTopic": "..."}`;

        for (const url of endpoints) {
            try {
                const response = await fetchWithTimeout(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                const data = await response.json();
                if (data.candidates && data.candidates[0]) {
                    const resText = data.candidates[0].content.parts[0].text;
                    const match = resText.match(/\{[\s\S]*\}/);
                    if (match) return JSON.parse(match[0].trim());
                }
            } catch (e) { }
        }
        return null;
    }

    async function generateFinalReport() {
        reportOverlay.style.display = 'flex';
        reportOverlay.classList.remove('hidden');
        const copyBtn = document.getElementById('copy-report-btn');
        if (copyBtn) {
            copyBtn.disabled = true;
            copyBtn.style.opacity = '0.5';
            copyBtn.textContent = '작성 중...';
        }
        const fullHistory = conversationHistory.map(h => `[${h.speaker === 'me' ? '나' : '상대방'}] ${h.text}`).join('\n');
        const prompt = `당신은 대화 분석 전문가입니다. 아래 대화 내용을 바탕으로 '종합 분석 보고서'를 반드시 '한국어'로만 작성해 주세요.
        제발 마크다운 블록(\`\`\`html)을 넣지 말고 생 HTML 태그만 출력하세요.
        - <h2> 태그로 제목 구분
        - <ul>, <li>로 핵심 내용 정리
        - 🎯 이모지 적절히 사용
        [보고서 구성]:
        1. 전체적인 대화 분위기 요약 (화자 간의 상호작용 중심)
        2. 놓치지 말아야 할 결정적 시그널
        3. 나를 위한 실전 대화 솔루션 및 피드백
        대화 내용:\n${fullHistory}`;
        const endpoints = [
            { model: "Gemini 2.0 Flash", url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}` },
            { model: "Gemini 1.5 Flash", url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}` }
        ];
        for (const ep of endpoints) {
            try {
                reportBody.innerHTML = `<div style="text-align:center; padding: 2rem;"><span class="pulse">🤖 [${ep.model}] 작성 중...</span></div>`;
                const response = await fetchWithTimeout(ep.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                    timeout: 20000
                });
                const data = await response.json();
                if (data.candidates && data.candidates[0]) {
                    let resultText = data.candidates[0].content.parts[0].text;
                    resultText = resultText.replace(/```html/g, '').replace(/```/g, '').trim();
                    reportBody.innerHTML = resultText;
                    if (copyBtn) {
                        copyBtn.disabled = false;
                        copyBtn.style.opacity = '1';
                        copyBtn.textContent = '보고서 복사';
                    }
                    return;
                }
            } catch (e) { }
        }
        reportBody.innerHTML = `<div style="text-align:center; padding: 1rem;"><p>⚠️ 오류 발생</p><button onclick="window.location.reload()">새로고침</button></div>`;
    }

    async function fetchWithTimeout(resource, options = {}) {
        const { timeout = 15000 } = options;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(resource, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    }
});
