// VERSION CONTROL: 5.1 (Pocket Mode & Vibration)
console.log("APP VERSION: 5.1 - Stealth & Haptic Feedback");

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
    const ambientOverlay = document.getElementById('ambient-overlay');
    const textInput = document.getElementById('text-input');
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const reportOverlay = document.getElementById('report-overlay');
    const reportBody = document.getElementById('report-body');
    const flowContainer = document.getElementById('flow-container');
    const saveBtn = document.getElementById('save-btn');
    const pocketBtn = document.getElementById('pocket-btn'); // New Stealth Button
    const pocketOverlay = document.getElementById('pocket-overlay');

    if (appStatus) appStatus.textContent = "✅ 앱 버전 5.1 로드 완료 (주머니 모드 + 진동)";

    let isAnalyzing = false;
    let recognition = null;
    let GEMINI_API_KEY = localStorage.getItem('GEMINI_API_KEY') || '';
    let wakeLock = null;
    let conversationHistory = [];
    let lastTopic = ""; // Track the last topic
    let ghostBubble = null; // For interim results

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

    // --- Pocket Mode Logic ---
    if (pocketBtn && pocketOverlay) {
        pocketBtn.addEventListener('click', () => {
            pocketOverlay.style.display = 'flex';
            // Try to acquire wake lock
            if ('wakeLock' in navigator) {
                navigator.wakeLock.request('screen').then(lock => {
                    wakeLock = lock;
                }).catch(e => console.error(e));
            }
        });

        // Double tap to exit
        let lastTap = 0;
        pocketOverlay.addEventListener('click', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 500 && tapLength > 0) {
                pocketOverlay.style.display = 'none';
                e.preventDefault();
            }
            lastTap = currentTime;
        });
    }

    // --- Speech Recognition Setup ---
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ko-KR';

        recognition.onstart = () => {
            isAnalyzing = true;
            analyzeBtn.classList.add('recording');
            analyzeBtn.innerHTML = '<span class="btn-icon">🛑</span> <span>분석 중지</span>';
            analyzeBtn.style.background = 'linear-gradient(135deg, #ef4444, #991b1b)';
            requestWakeLock();
            
            // Show Pocket Button
            if (pocketBtn) {
                pocketBtn.style.display = 'flex';
            }

            // Haptic Feedback: Start
            if (navigator.vibrate) navigator.vibrate(200); 
        };

        recognition.onend = () => {
            // Only vibrate if stopped unexpectedly (not by button)
            if (isAnalyzing) {
                if (navigator.vibrate) navigator.vibrate(500); // Error buzz
                console.log('Restarting recognition...');
                recognition.start();
            } else {
                analyzeBtn.classList.remove('recording');
                analyzeBtn.innerHTML = '<span class="btn-icon">🎙️</span> <span>분석 시작</span>';
                analyzeBtn.style.background = '';
                appStatus.innerHTML = "✅ 분석 종료";
                ambientOverlay.style.background = '';
                
                // Hide Pocket Button
                if (pocketBtn) {
                    pocketBtn.style.display = 'none';
                    if (pocketOverlay) pocketOverlay.style.display = 'none';
                }
                
                // Haptic Feedback: End
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]); 
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // Handle Interim Results (Ghost Bubble)
            if (interimTranscript) {
                // Subtle Haptic Feedback for "I hear you"
                if (navigator.vibrate && interimTranscript.length % 5 === 0) {
                     // Vibrate every few chars to avoid buzzing too much
                     navigator.vibrate(15); 
                }

                if (!ghostBubble) {
                    ghostBubble = addFlowBubble('me', interimTranscript, 0);
                    ghostBubble.classList.add('ghost');
                    const speakerLabel = ghostBubble.querySelector('.bubble-speaker');
                    if (speakerLabel) speakerLabel.textContent = "듣는 중...";
                } else {
                    const contentDiv = ghostBubble.querySelector('div:not(.bubble-speaker)');
                    if (contentDiv) contentDiv.textContent = interimTranscript;
                    // Auto scroll
                    if (flowContainer) flowContainer.scrollTop = flowContainer.scrollHeight;
                }
            }

            // Handle Final Results
            if (finalTranscript) {
                if (ghostBubble) {
                    ghostBubble.remove();
                    ghostBubble = null;
                }
                
                // Haptic Feedback: Sentence Complete
                if (navigator.vibrate) navigator.vibrate([50, 50]);

                appStatus.innerHTML = "👂 <span style='color: #cffafe;'>경청 완료, 분석 중...</span>";
                triggerAnalysis(finalTranscript);
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
            if (!recognition) {
                alert("🚫 이 브라우저는 음성 인식을 지원하지 않습니다.\n(iPhone은 Safari, Android는 Chrome을 사용해 주세요.)");
                return;
            }
            if (isAnalyzing) {
                stopAnalysis();
            } else {
                isAnalyzing = true;
                conversationHistory = [];
                try { 
                    recognition.start(); 
                    appStatus.innerHTML = "🎙️ <span class='pulse'>실시간 분석 중... 말씀해 주세요.</span>";
                    ambientOverlay.style.background = `radial-gradient(circle at center, #ef4444, transparent 70%)`;
                } catch (e) { 
                    console.error(e);
                    alert("⚠️ 마이크 실행 실패: 권한을 확인해주세요.");
                    isAnalyzing = false;
                }
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

        return bubble; // Return element for updates
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
        if (!text.trim()) return;

        if (!GEMINI_API_KEY) {
            alert("⚠️ API 키가 설정되지 않았습니다.\n설정 창에서 Google AI Studio 키를 입력해 주세요.");
            if (settingsPanel) settingsPanel.classList.remove('hidden');
            if (apiKeyInput) apiKeyInput.focus();
            appStatus.innerHTML = "⚠️ <span style='color:#f87171'>API 키가 필요합니다.</span>";
            isAnalyzing = false;
            analyzeBtn.innerHTML = '<span class="btn-icon">🎙️</span> <span>분석 시작</span>';
            analyzeBtn.style.background = '';
            return;
        }
        // 1. Immediate UI Feedback (Optimistic UI)
        // Show the bubble IMMEDIATELY as "Analyzing..."
        const pendingBubble = addFlowBubble('analzying', text, 0);
        if (pendingBubble) {
            pendingBubble.classList.add('pending');
            const speakerLabel = pendingBubble.querySelector('.bubble-speaker');
            if (speakerLabel) speakerLabel.textContent = "⏳ 분석 중...";
        }

        try {
            appStatus.innerHTML = "🤖 <span class='pulse'>박사님이 집중 분석 중...</span>";
            const context = conversationHistory.slice(-5).map(h => `${h.speakerTag}: ${h.text}`).join(' | ');
            const response = await callGemini(text, context);
            
            if (response) {
                // Topic Change Detection
                if (response.isTopicChanged && response.currentTopic) {
                     addTopicDivider(response.currentTopic);
                }
                if (response.currentTopic) {
                    lastTopic = response.currentTopic;
                }

                // Save to history with speaker info
                conversationHistory.push({
                    speaker: response.speaker || 'other',
                    speakerTag: response.speakerTag || (response.speaker === 'me' ? '나' : '상대방'),
                    text: text,
                    summary: text // No summary needed in v5.0
                });
                if (conversationHistory.length > 100) conversationHistory.shift(); // Increased history size
                
                // 2. Update the pending bubble with real results
                if (pendingBubble) {
                    pendingBubble.classList.remove('pending');
                    
                    // Reset classes
                    pendingBubble.className = `chat-bubble ${response.speaker === 'me' ? 'me' : 'other'}`;
                    if (response.speaker !== 'me' && response.speakerId > 0) {
                        pendingBubble.classList.add(`p${(response.speakerId % 5) || 5}`);
                    }

                    // Update label
                    const speakerLabel = pendingBubble.querySelector('.bubble-speaker');
                    if (speakerLabel) {
                        speakerLabel.textContent = response.speakerTag || (response.speaker === 'me' ? '나' : '상대방');
                    }
                } else {
                    // If somehow bubble was lost, add new one
                    addFlowBubble(response.speakerTag || response.speaker, text, response.speakerId || 0);
                }
            } else {
                throw new Error("No response from Gemini");
            }
        } catch (error) {
            console.error(error);
            appStatus.textContent = "⚠️ 분석 지연 (텍스트 저장됨)";
            
            // Fallback: Make it look like a generic message
            if (pendingBubble) {
                pendingBubble.classList.remove('pending');
                pendingBubble.className = 'chat-bubble other'; // Default to other
                const speakerLabel = pendingBubble.querySelector('.bubble-speaker');
                if (speakerLabel) speakerLabel.textContent = "상대방 (분석 실패)";
            }
        }
    }

    async function callGemini(text, context) {
        if (!GEMINI_API_KEY) return null;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
        
        // Simplified Prompt for v5.0
        const prompt = `
        You are a conversation logger and topic detector.
        
        Current context:
        ${context}
        
        New input: "${text}"

        Task:
        1. Identify the speaker ("me" or "other"). If uncertain, infer from context.
        2. Assign a Speaker ID (0 for me, 1-4 for others) for "other" speakers if disjoint.
        3. Detect if the TOPIC has successfully changed.
        4. Do NOT analyze mood, hidden intent, or suggestions. We only want to log the flow.
        5. Just return the transcription confirmation and topic.

        Output JSON:
        {
            "speaker": "me" or "other",
            "speakerId": number (0 for me, 1-4 for others),
            "speakerTag": "Display Name" (e.g. "나", "상대방", "동료"),
            "currentTopic": "Short Topic Title" (null if same as before),
            "isTopicChanged": boolean
        }
        `;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();
            const resultText = data.candidates[0].content.parts[0].text;
            
            // Clean JSON code blocks
            const jsonStr = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error("Gemini API Error:", error);
            return null;
        }
    }

    // New Save Functionality
    if (saveBtn) {
        saveBtn.addEventListener('click', saveConversation);
    }

    function saveConversation() {
        if (conversationHistory.length === 0) {
            alert("저장할 대화 내용이 없습니다.");
            return;
        }

        let content = "===== 대화 기록 로그 (비밀 파트너 v5.0) =====\n\n";
        const now = new Date();
        content += `저장 일시: ${now.toLocaleString()}\n\n`;

        conversationHistory.forEach((item, index) => {
             content += `[${item.speakerTag || item.speaker}] ${item.text}\n`;
             if (item.summary && item.summary !== item.text) {
                 // content += `   (요약: ${item.summary})\n`; 
             }
             content += "\n";
        });

        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `conversation_log_${now.getFullYear()}${now.getMonth()+1}${now.getDate()}_${now.getHours()}${now.getMinutes()}.txt`;
        a.click();
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
