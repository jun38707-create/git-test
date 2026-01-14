// VERSION CONTROL: 9.3 (Refactored Clean Integration)
console.log("APP VERSION: 9.3 - Refactored Smart TOC & Audio Map (" + new Date().toLocaleTimeString() + ")");

// =========================================================================
// 1. GLOBAL UTILITY & RECOVERY LAYER
// =========================================================================

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
    if (text.includes("작성 중")) {
        alert("⚠️ 보고서가 아직 완성되지 않았습니다.");
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        alert('📋 클립보드에 복사되었습니다.');
        window.closeReport();
    });
};

window.forceAppReload = () => {
    if (confirm('🔄 앱을 새로고침 하시겠습니까?')) {
        const freshUrl = window.location.pathname + '?v=' + new Date().getTime(); // Anti-cache
        window.location.replace(freshUrl);
    }
};

window.panicReset = () => {
    if (confirm('🚨 모든 설정을 초기화하고 재시작하시겠습니까? (API 키 삭제됨)')) {
        localStorage.clear();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                for (let r of regs) r.unregister();
            });
        }
        window.location.reload(true);
    }
};

// =========================================================================
// 2. MAIN APPLICATION LOGIC
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    
    // --- UI Elements ---
    const analyzeBtn = document.getElementById('analyze-btn');
    const appStatus = document.getElementById('app-status');
    const ambientOverlay = document.getElementById('ambient-overlay');
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const reportOverlay = document.getElementById('report-overlay');
    const reportBody = document.getElementById('report-body');
    const flowContainer = document.getElementById('flow-container');
    const saveBtn = document.getElementById('save-btn'); // Legacy Text Log
    const pocketBtn = document.getElementById('pocket-btn');
    const pocketOverlay = document.getElementById('pocket-overlay');

    // --- State Variables ---
    let GEMINI_API_KEY = localStorage.getItem('GEMINI_API_KEY') || '';
    let isAnalyzing = false;
    let wakeLock = null;
    
    // Speech & Audio
    let recognition = null;
    let mediaRecorder = null;
    let audioChunks = [];
    
    // Context Tracking
    let conversationHistory = [];
    let lastProcessedText = "";
    let lastProcessedTime = 0;
    
    // v9.2 Smart TOC Variables
    let startTime = null;
    let tocLog = [];

    // --- Init ---
    if (appStatus) appStatus.textContent = "✅ 시스템 준비 완료 (v9.3 최적화 버전)";
    if (GEMINI_API_KEY && apiKeyInput) apiKeyInput.value = GEMINI_API_KEY;


    // =========================================================================
    // 3. HELPER FUNCTIONS
    // =========================================================================

    // Time Format Helper (MM:SS)
    const getRelativeTime = () => {
        if (!startTime) return "00:00";
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const sec = String(elapsed % 60).padStart(2, '0');
        return `${min}:${sec}`;
    };

    // TOC Logging Helper
    const logEvent = (type, content) => {
        const time = getRelativeTime();
        const icon = type === 'topic' ? '📌' : '✨';
        const entry = `${time} | ${icon} ${type === 'topic' ? '주제' : '중요'}: ${content}`;
        console.log(`[TOC] ${entry}`);
        tocLog.push(entry);
        
        // Setup Bookmark Button Feedback
        if (type === 'bookmark') {
            const btn = document.getElementById('bookmark-btn');
            if (btn) {
                btn.style.transform = 'scale(0.9)';
                setTimeout(() => btn.style.transform = 'scale(1)', 200);
            }
            showToast(`✨ 중요 지점 체크! (${time})`, 'success'); 
        }
    };

    // Toast UI
    function showToast(message, type = "success") {
        let toast = document.getElementById('toast-msg');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast-msg';
            Object.assign(toast.style, {
                position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
                padding: '12px 24px', borderRadius: '30px', zIndex: '3000', fontSize: '0.9rem',
                boxShadow: '0 10px 30px rgba(0,0,0,0.3)', transition: 'opacity 0.5s', opacity: '0'
            });
            document.body.appendChild(toast);
        }
        toast.style.background = type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)';
        toast.textContent = message;
        toast.style.opacity = '1';
        setTimeout(() => toast.style.opacity = '0', 3000);
    }

    // Blob -> Base64
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Wake Lock
    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
        }
    }


    // =========================================================================
    // 4. EVENT LISTENERS & SETUP
    // =========================================================================

    // Settings Toggle
    if (settingsToggle) {
        settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsPanel.classList.toggle('hidden');
        });
    }

    // API Key Save
    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', () => {
            GEMINI_API_KEY = apiKeyInput.value.trim();
            localStorage.setItem('GEMINI_API_KEY', GEMINI_API_KEY);
            alert('API 키가 저장되었습니다.');
            settingsPanel.classList.add('hidden');
        });
    }

    // Pocket Mode
    if (pocketBtn && pocketOverlay) {
        pocketBtn.addEventListener('click', () => {
            pocketOverlay.style.display = 'flex';
            requestWakeLock();
        });
        
        let lastTap = 0;
        pocketOverlay.addEventListener('click', (e) => {
            const currentTime = new Date().getTime();
            if (currentTime - lastTap < 500) {
                 pocketOverlay.style.display = 'none';
                 e.preventDefault();
            }
            lastTap = currentTime;
        });
    }


    // =========================================================================
    // 5. CORE LOGIC: RECORDING & ANALYSIS
    // =========================================================================

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            if (!('webkitSpeechRecognition' in window)) {
                alert("🚫 이 브라우저는 음성 인식을 지원하지 않습니다. (Chrome 권장)");
                return;
            }

            if (isAnalyzing) {
                // STOP
                isAnalyzing = false; 
                if (recognition) recognition.stop();
                finalizeRecording();
            } else {
                // START
                startSession();
            }
        });
    }

    function startSession() {
        if (!GEMINI_API_KEY) {
            alert("⚠️ 설정에서 API 키를 먼저 입력해주세요.");
            settingsPanel.classList.remove('hidden');
            return;
        }

        isAnalyzing = true;
        conversationHistory = [];
        flowContainer.innerHTML = ''; // Clear previous
        
        // Start Speech Recognition
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ko-KR';

        recognition.onstart = handleRecognitionStart;
        recognition.onend = handleRecognitionEnd;
        recognition.onresult = handleRecognitionResult;
        recognition.onerror = (e) => console.error("Recognition Error:", e.error);

        try { 
            recognition.start(); 
        } catch (e) { 
            console.error(e);
            isAnalyzing = false;
        }
    }

    async function handleRecognitionStart() {
        console.log("Recognition Started");
        
        // Init Time & Log
        startTime = Date.now();
        tocLog = [`00:00 | 🎬 녹음 시작`];

        // UI Update
        analyzeBtn.classList.add('recording');
        analyzeBtn.innerHTML = '<span class="btn-icon">🛑</span> <span>추적 중지</span>';
        analyzeBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        ambientOverlay.style.background = `radial-gradient(circle at center, rgba(16, 185, 129, 0.2), transparent 70%)`; 
        appStatus.innerHTML = "🎧 <span class='pulse'>맥락 추적 & 녹음 중...</span>";
        if (pocketBtn) pocketBtn.style.display = 'flex';

        // Haptics
        if (navigator.vibrate) navigator.vibrate(200);
        requestWakeLock();

        // Inject Bookmark Button
        injectBookmarkButton();

        // Start Audio Recording
        await startAudioRecording();
    }

    async function startAudioRecording() {
        if (typeof MediaRecorder === 'undefined') return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Format Selection
            let mimeType = 'audio/webm';
            let fileExt = 'webm';
            if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4'; fileExt = 'm4a';
            } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                mimeType = 'audio/aac'; fileExt = 'aac';
            }

            mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorder.mimeTypeString = mimeType;
            mediaRecorder.extensionString = fileExt;
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.start();
            console.log(`Recording started: ${mimeType}`);

        } catch (err) {
            console.error("Mic Error:", err);
            appStatus.innerHTML = "👀 맥락 추적 중 (녹음 불가)";
        }
    }

    function handleRecognitionEnd() {
        if (isAnalyzing) {
            // Unexpected stop -> Restart
            console.log('Restoring recognition...');
            try { recognition.start(); } catch(e) { finalizeRecording(); }
        }
    }

    function handleRecognitionResult(event) {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }

        if (finalTranscript) {
            if (navigator.vibrate) navigator.vibrate([20]); 
            processDialogueForTopics(finalTranscript); // Logic extracted
        }
    }

    // --- Topic Detection & AI ---
    async function processDialogueForTopics(text) {
        if (!text.trim()) return;
        
        // De-duplication
        const now = Date.now();
        if (text === lastProcessedText && (now - lastProcessedTime < 2000)) return;
        lastProcessedText = text; lastProcessedTime = now;

        appStatus.innerHTML = "📝 <span class='pulse'>맥락 분석 중...</span>";

        const context = conversationHistory.slice(-5).map(h => h.text).join(' | ');
        const apiResponse = await callGeminiForTopics(text, context);

        if (apiResponse && apiResponse.isTopicChanged && apiResponse.currentTopic) {
             addTopicDivider(apiResponse.currentTopic);
             appStatus.textContent = `📌 주제: ${apiResponse.currentTopic}`;
        }

        conversationHistory.push({ text: text });
        if (conversationHistory.length > 50) conversationHistory.shift();
    }

    async function callGeminiForTopics(text, context) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
        const prompt = `
        You are a smart conversation logger.
        Context: ${context}
        New Input: "${text}"
        Task: 1. Detect if the TOPIC has changed significantly. 2. Just return the Topic status json.
        Output JSON: { "currentTopic": "Short Topic Title" (or null), "isTopicChanged": boolean }
        `;
        
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            let txt = data.candidates[0].content.parts[0].text;
            return JSON.parse(txt.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (e) { return null; }
    }


    // =========================================================================
    // 6. FINALIZATION & DOWNLOADS
    // =========================================================================

    function finalizeRecording() {
        console.log("Finalizing Session...");
        
        // 1. UI Cleanup
        analyzeBtn.classList.remove('recording');
        analyzeBtn.innerHTML = '<span class="btn-icon">🎙️</span> <span>추적 시작</span>';
        analyzeBtn.style.background = '';
        appStatus.innerHTML = "✅ 저장 및 마무리 중...";
        ambientOverlay.style.background = '';
        
        if (pocketBtn) pocketBtn.style.display = 'none';
        if (pocketOverlay) pocketOverlay.style.display = 'none';
        
        // Hide Bookmark
        const bookmarkBtn = document.getElementById('bookmark-btn');
        if (bookmarkBtn) bookmarkBtn.style.display = 'none';

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]); 

        // 2. Stop Recorder & Process Files
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunks, { type: mediaRecorder.mimeTypeString });
                createCompletionUI(blob, mediaRecorder.extensionString);
                
                if (mediaRecorder.stream) mediaRecorder.stream.getTracks().forEach(t => t.stop());
                mediaRecorder = null;
            };
            mediaRecorder.stop();
        }
    }

    function createCompletionUI(blob, ext) {
        if (!flowContainer) return;

        // Filename
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const audioFilename = `recording_${dateStr}.${ext}`;
        const audioUrl = URL.createObjectURL(blob);

        // --- Container ---
        const container = document.createElement('div');
        Object.assign(container.style, {
            textAlign: 'center', marginTop: '20px', padding: '15px',
            background: 'rgba(255,255,255,0.05)', borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)', display: 'flex', 
            flexDirection: 'column', gap: '10px'
        });

        // 1. Msg
        const msg = document.createElement('p');
        msg.innerHTML = "🎙️ <b>녹음 완료</b><br><span style='font-size:0.8rem; color:#aaa'>파일이 자동 저장되었습니다.</span>";
        
        // 2. Analyze Button (Integrated)
        const analyzeBtn = document.createElement('button');
        analyzeBtn.className = 'main-fab'; 
        Object.assign(analyzeBtn.style, {
            width: '100%', padding: '10px', fontSize: '0.95rem', borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
        });
        analyzeBtn.innerHTML = '⚡ 이 내용 지금 바로 요약하기';
        analyzeBtn.onclick = () => runPostAnalysis(blob, analyzeBtn);

        // 3. Audio Download
        const downBtn = createDownloadBtn(audioUrl, audioFilename, `💾 오디오 저장 (${(blob.size/1024/1024).toFixed(1)}MB)`);
        
        // 4. TOC Download
        const tocBtn = createTOCLink(dateStr);

        container.append(msg, analyzeBtn, downBtn);
        if (tocBtn) container.appendChild(tocBtn);
        flowContainer.appendChild(container);
        flowContainer.scrollTop = flowContainer.scrollHeight;

        // Auto Download
        autoDownload(audioUrl, audioFilename);
    }

    function createDownloadBtn(url, filename, text) {
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.className = 'btn-secondary';
        a.innerHTML = `<span>${text}</span>`;
        Object.assign(a.style, { textAlign: 'center', display: 'block', textDecoration: 'none' });
        return a;
    }

    function createTOCLink(dateStr) {
        if (!tocLog || tocLog.length === 0) return null;
        const content = tocLog.join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        return createDownloadBtn(
            URL.createObjectURL(blob), 
            `대화목차_${dateStr}.txt`, 
            `📜 목차 파일 저장 (.txt)`
        );
    }

    function autoDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a);
        setTimeout(() => {
            try { a.click(); showToast("💾 파일 저장 완료!"); } 
            catch { showToast("⚠️ 자동 저장 실패. 버튼을 눌러주세요.", "error"); }
            document.body.removeChild(a);
        }, 100);
    }

    function injectBookmarkButton() {
        let btn = document.getElementById('bookmark-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'bookmark-btn';
            btn.innerHTML = '✨ 중요';
            Object.assign(btn.style, {
                position: 'fixed', bottom: '110px', right: '24px', width: '64px', height: '64px',
                borderRadius: '50%', background: '#f59e0b', border: 'none', color: 'white',
                boxShadow: '0 6px 20px rgba(245, 158, 11, 0.4)', fontSize: '14px', fontWeight: 'bold',
                zIndex: '9999', cursor: 'pointer', transition: 'transform 0.2s', display: 'none'
            });
            btn.onclick = () => logEvent('bookmark', '사용자 체크');
            document.body.appendChild(btn);
        }
        btn.style.display = 'block';
    }

    function addTopicDivider(topic) {
        if (!flowContainer) return;
        logEvent('topic', topic); // Log to TOC
        const div = document.createElement('div');
        div.className = 'topic-divider';
        div.innerHTML = `<span>📌 주제: ${topic}</span>`;
        flowContainer.appendChild(div);
        flowContainer.scrollTop = flowContainer.scrollHeight;
    }

    async function runPostAnalysis(blob, btn) {
        btn.disabled = true; btn.innerHTML = '⏳ 분석 중...';
        reportBody.innerHTML = `<div style="text-align:center; padding: 2rem;"><h3 class="pulse">🤖 분석 중...</h3></div>`;
        reportOverlay.classList.remove('hidden');
        reportOverlay.style.display = 'flex';

        try {
            const base64 = await blobToBase64(blob);
            const transcript = await analyzeAudioWithGemini({
                inlineData: { data: base64, mimeType: blob.type }
            });
            // Keep formatting logic inside here or separate
            if (transcript) reportBody.innerHTML = transcript.replace(/\n/g, '<br>');
        } catch (e) {
            reportBody.innerHTML = `<div style="color:#f87171; text-align:center">❌ 분석 실패: ${e.message}</div>`;
        }
        btn.disabled = false; btn.innerHTML = '⚡ 다시 요약하기';
    }
    
    // Legacy Report Generation (Text) - Optional keep for safety
    // ... (rest omitted to save space, but keeping key audio functions) ...
    // Note: I will reimplement analyzeAudioWithGemini here
    async function analyzeAudioWithGemini(audioPart) {
         const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
         const prompt = `
         Listen to this.
         Task: 1. Forget Transcript. 2. Focus on Context/Topic/Atmosphere. 3. Key Decisions.
         Output: HTML Format (<h2>, <ul>...)
         `;
         const res = await fetch(url, {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({ contents: [{ parts: [{text: prompt}, audioPart] }] })
         });
         const data = await res.json();
         if(data.error) throw new Error(data.error.message);
         return data.candidates[0].content.parts[0].text;
    }

});
