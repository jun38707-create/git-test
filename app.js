// VERSION CONTROL: 7.0 (Context Tracker & Audio Switch)
console.log("APP VERSION: 7.0 - Hidden Text & Audio Recorder");

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
    const pocketBtn = document.getElementById('pocket-btn');
    const pocketOverlay = document.getElementById('pocket-overlay');

    if (appStatus) appStatus.textContent = "✅ 시스템 준비 완료 (v7.0 맥락 트래커 & 오디오)";

    let isAnalyzing = false;
    let recognition = null;
    
    // De-duplication variables
    let lastProcessedText = "";
    let lastProcessedTime = 0;

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
    // --- Audio File Upload & Analysis Logic (v7.0) ---
    const audioUpload = document.getElementById('audio-upload');
    if (audioUpload) {
        audioUpload.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            if (!GEMINI_API_KEY) {
                alert("⚠️ API 키가 필요합니다. 설정에서 키를 먼저 입력해주세요.");
                settingsPanel.classList.remove('hidden');
                return;
            }

            // Show Loading in Report Modal
            reportOverlay.style.display = 'flex';
            reportOverlay.classList.remove('hidden');
            reportBody.innerHTML = `
                <div style="text-align:center; padding: 2rem;">
                    <h3 class="pulse">🎧 오디오 분석 중...</h3>
                    <p style="font-size: 0.8rem; color: #aaa; margin-top:10px;">파일 크기에 따라 10~30초 정도 걸릴 수 있습니다.<br>AI가 목소리를 듣고 화자를 구분하고 있습니다.</p>
                </div>`;

            try {
                // Convert file to Base64
                const base64Audio = await fileToGenerativePart(file);
                
                // Call Gemini 1.5 Flash (Multimodal)
                const transcript = await analyzeAudioWithGemini(base64Audio);
                
                // Display Result
                if (transcript) {
                    reportBody.innerHTML = formatTranscript(transcript);
                    const copyBtn = document.getElementById('copy-report-btn');
                    if (copyBtn) {
                        copyBtn.disabled = false;
                        copyBtn.style.opacity = '1';
                        copyBtn.textContent = '분석 결과 복사';
                    }
                } else {
                    throw new Error("No transcript generated.");
                }

            } catch (error) {
                console.error("Audio Analysis Error:", error);
                reportBody.innerHTML = `<div style="text-align:center; padding: 2rem; color: #f87171;">
                    <h3>❌ 분석 실패</h3>
                    <p>오류가 발생했습니다: ${error.message}</p>
                    <p style="font-size: 0.8rem; margin-top: 10px;">파일이 너무 크거나(20MB 이하 권장), API 키 권한을 확인해주세요.</p>
                </div>`;
            }
            
            // Reset input so same file can be selected again
            audioUpload.value = '';
        });
    }

    async function fileToGenerativePart(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result.split(',')[1];
                resolve({
                    inlineData: {
                        data: base64String,
                        mimeType: file.type
                    }
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function analyzeAudioWithGemini(audioPart) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const prompt = `
        Listen to this audio recording of a conversation.
        Task:
        1. Transcribe the conversation exactly into Korean.
        2. Distinguish speakers by voice (e.g., Speaker A, Speaker B).
        3. Format the output cleanly.

        Output Format:
        <h2>🎙️ 대화 녹취록</h2>
        <ul>
        <li><b>화자 A:</b> ...message...</li>
        <li><b>화자 B:</b> ...message...</li>
        </ul>
        <hr>
        <h3>📝 요약</h3>
        <p>...summary...</p>
        `;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        audioPart
                    ]
                }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.candidates[0].content.parts[0].text;
    }

    function formatTranscript(rawText) {
        // Simple formatter to ensure it looks good in HTML
        return rawText.replace(/\n/g, '<br>');
    }


    // --- Speech Recognition & Audio Recording Setup ---
    let mediaRecorder = null;
    let audioChunks = [];

    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ko-KR';

        recognition.onstart = async () => {
            isAnalyzing = true;
            analyzeBtn.classList.add('recording');
            analyzeBtn.innerHTML = '<span class="btn-icon">🛑</span> <span>분석 중지</span>';
            
            // Visual indicator
            ambientOverlay.style.background = `radial-gradient(circle at center, rgba(16, 185, 129, 0.2), transparent 70%)`; // Green tint for context mode
            analyzeBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            
            appStatus.innerHTML = "🎧 <span class='pulse'>맥락 추적 & 녹음 중...</span>";

            // Start Audio Recording
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) audioChunks.push(event.data);
                };
                
                mediaRecorder.start();
                console.log("Audio recording started.");
            } catch (err) {
                console.error("Microphone access error for recording:", err);
                alert("⚠️ 오디오 녹음을 시작할 수 없지만, 맥락 분석은 계속됩니다.");
            }

            requestWakeLock();
            if (pocketBtn) pocketBtn.style.display = 'flex';
            if (navigator.vibrate) navigator.vibrate(200); 
        };

        recognition.onend = () => {
            if (isAnalyzing) {
                if (navigator.vibrate) navigator.vibrate(500);
                console.log('Restarting recognition...');
                recognition.start();
            } else {
                // STOPPED INTENTIONALLY
                analyzeBtn.classList.remove('recording');
                analyzeBtn.innerHTML = '<span class="btn-icon">🎙️</span> <span>추적 시작</span>';
                analyzeBtn.style.background = '';
                appStatus.innerHTML = "✅ 추적 종료";
                ambientOverlay.style.background = '';
                
                if (pocketBtn) {
                    pocketBtn.style.display = 'none';
                    if (pocketOverlay) pocketOverlay.style.display = 'none';
                }
                
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]); 

                // Stop Audio Recording
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                    mediaRecorder.onstop = () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                        createAudioDownloadLink(audioBlob);
                    };
                    // Stop all tracks to release mic
                    mediaRecorder.stream.getTracks().forEach(track => track.stop());
                }
            }
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            // v7.0: IGNORE Interim Results (No Ghost Bubble)
            // We only care about finalized text for Context Analysis

            if (finalTranscript) {
                // Haptic Feedback: Context Updated
                if (navigator.vibrate) navigator.vibrate([20]); 
                // Do NOT print text bubbles. Only log for AI.
                logDialogueStream(finalTranscript);
            }
        };

        recognition.onerror = (event) => {
            console.error("Recognition Error:", event.error);
            if (event.error === 'not-allowed') {
                appStatus.innerHTML = "❌ <span style='color:#f87171'>마이크 권한을 허용해주세요.</span>";
            }
        };
    }

    function createAudioDownloadLink(blob) {
        if (!flowContainer) return;
        
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const filename = `recording_${now.getHours()}${now.getMinutes()}.webm`;
        
        const container = document.createElement('div');
        container.style.textAlign = 'center';
        container.style.marginTop = '20px';
        container.style.padding = '10px';
        container.style.background = 'rgba(255,255,255,0.05)';
        container.style.borderRadius = '10px';

        const msg = document.createElement('p');
        msg.textContent = "🎙️ 녹음 파일이 준비되었습니다.";
        msg.style.fontSize = '0.9rem';
        msg.style.marginBottom = '10px';

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.className = 'audio-btn';
        a.innerHTML = `<span>💾 오디오 다운로드 (${(blob.size / 1024 / 1024).toFixed(2)} MB)</span>`;
        a.style.display = 'inline-flex';

        container.appendChild(msg);
        container.appendChild(a);
        
        // Insert at the VERY TOP of flow container or bottom? 
        // Bottom is better.
        flowContainer.appendChild(container);
        flowContainer.scrollTop = flowContainer.scrollHeight;
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
                alert("🚫 이 브라우저는 지원하지 않습니다.");
                return;
            }
            if (isAnalyzing) {
                isAnalyzing = false; // Trigger onend logic
                recognition.stop();
            } else {
                isAnalyzing = true;
                conversationHistory = [];
                // Clear flow container except empty msg? 
                // Let's clear it to start fresh
                flowContainer.innerHTML = '<div class="empty-flow" style="display:none"></div>';
                
                try { 
                    recognition.start(); 
                } catch (e) { 
                    console.error(e);
                    isAnalyzing = false;
                }
            }
        });
    }

    // REMOVED stopAnalysis function, integrated into onend logic for cleaner flow


    function addFlowBubble(text, isGhost = false) {
        if (!flowContainer) return;

        // Remove empty state message if exists
        const emptyMsg = flowContainer.querySelector('.empty-flow');
        if (emptyMsg) emptyMsg.remove();

        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        if (isGhost) bubble.classList.add('pending');

        const speakerLabel = document.createElement('span');
        speakerLabel.className = 'bubble-speaker';
        
        // Timestamp as "Speaker"
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        speakerLabel.textContent = `Time: ${timeStr}`;

        const content = document.createElement('div');
        content.textContent = text;

        bubble.appendChild(speakerLabel);
        bubble.appendChild(content);
        flowContainer.appendChild(bubble);

        // Scroll to bottom
        flowContainer.scrollTop = flowContainer.scrollHeight;

        return bubble; 
    }

    function addTopicDivider(topicText) {
        if (!flowContainer) return;

        const divider = document.createElement('div');
        divider.className = 'topic-divider';
        divider.innerHTML = `<span>📌 주제: ${topicText}</span>`;
        
        flowContainer.appendChild(divider);
        flowContainer.scrollTop = flowContainer.scrollHeight;
    }

    async function logDialogueStream(text) {
        if (!text.trim()) return;
        
        // --- De-duplication Logic ---
        const now = Date.now();
        if (text === lastProcessedText && (now - lastProcessedTime < 2000)) {
            console.log("Duplicate skipped:", text);
            return;
        }
        lastProcessedText = text;
        lastProcessedTime = now;

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

        let pendingBubble = null;

        try {
            appStatus.innerHTML = "📝 <span class='pulse'>맥락 분석 중...</span>";
            
            // v7.0: Hidden Text Mode (Do NOT add bubble)
            // pendingBubble = addFlowBubble(text, false); 
            
            const context = conversationHistory.slice(-5).map(h => h.text).join(' | ');
            const apiResponse = await callGemini(text, context);
            
            let topicFound = null;

            if (apiResponse) {
                if (apiResponse.isTopicChanged && apiResponse.currentTopic) {
                     topicFound = apiResponse.currentTopic;
                     // Insert divider BEFORE the current bubble if possible, 
                     // but here we just append it after logic or maybe before next?
                     // Let's insert it visually before this bubble if we could, 
                     // but simplified: just add it now or next? 
                     // User asked for "Topic Change" -> Add divider.
                     
                     // Move the bubble down? No, just add divider for NOW.
                     // Actually, if topic changed, it applies to THIS text. 
                     // So strictly it should be above. 
                     // For v6.0 simplified, let's just add it at bottom for next turn?
                     // Or better: Insert before current bubble. 
                     if (pendingBubble) {
                         const divider = document.createElement('div');
                         divider.className = 'topic-divider';
                         divider.innerHTML = `<span>📌 주제 변경: ${topicFound}</span>`;
                         flowContainer.insertBefore(divider, pendingBubble);
                     }
                }
                
                // Refine text if Gemini suggests a cleaner version?
                // For now, keep raw text as user requested reliable input.
            }

            if (topicFound) {
                appStatus.textContent = `📌 주제: ${topicFound}`;
            }

            // Save to history
            conversationHistory.push({
                speaker: 'neutral',
                speakerTag: 'LOG',
                text: text,
                summary: text 
            });
            if (conversationHistory.length > 100) conversationHistory.shift();

        } catch (error) {
            console.error(error);
            appStatus.textContent = "⚠️ 기록 완료 (AI 지연)";
        }
    }

    async function callGemini(text, context) {
        if (!GEMINI_API_KEY) return null;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
        
        // v6.0 Prompt: Neutral Logger & Topic Detector
        const prompt = `
        You are a smart conversation logger.
        
        Context: ${context}
        New Input: "${text}"

        Task:
        1. Detect if the TOPIC has successfully changed significantly.
        2. Do NOT try to identify speakers.
        3. Just return the Topic status.

        Output JSON:
        {
            "currentTopic": "Short Topic Title" (or null),
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

        // If all failing, show specific error
        console.error("Report Generation Failed");
        reportBody.innerHTML = `<div style="text-align:center; padding: 1rem;">
            <p>⚠️ 보고서 작성 실패</p>
            <p style="font-size: 0.8rem; color: #aaa;">인터넷 연결을 확인하거나 잠시 후 다시 시도해주세요.</p>
            <button onclick="window.location.reload()" style="margin-top:10px; padding: 5px 10px;">새로고침</button>
        </div>`;
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
