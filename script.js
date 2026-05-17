/* ==========================================================================
   神呼吸計鍊習系統 - 核心控制邏輯 (更新版)
   設計特點：Web Audio API 自建提示音與合成白噪音、吉祥物發光與自由拖曳定位、無白雜訊外部依賴
   語言：繁體中文
   ========================================================================== */

// 確保在頁面載入完成後執行
document.addEventListener("DOMContentLoaded", () => {
    
    /* ==========================================================================
       狀態與變數宣告
       ========================================================================== */
    // 呼吸模式數據定義
    const BREATH_MODES = {
        "478": {
            name: "4-7-8 助眠呼吸法",
            sequence: [
                { state: "inhale", duration: 4, text: "吸氣", subtext: "用鼻子深吸氣，感受能量湧入" },
                { state: "hold",   duration: 7, text: "屏氣", subtext: "屏住呼吸，凝聚心神" },
                { state: "exhale", duration: 8, text: "吐氣", subtext: "用嘴徐徐吐氣，釋放所有壓力" }
            ]
        },
        "box": {
            name: "Box 等比呼吸法",
            sequence: [
                { state: "inhale", duration: 4, text: "吸氣", subtext: "吸氣四秒，保持平穩" },
                { state: "hold",   duration: 4, text: "屏氣", subtext: "屏住呼吸，靜心止水" },
                { state: "exhale", duration: 4, text: "吐氣", subtext: "吐氣四秒，排除雜念" },
                { state: "hold",   duration: 4, text: "屏氣", subtext: "再次屏氣，重獲專注" }
            ]
        },
        "abdominal": {
            name: "5-5 腹式呼吸法",
            sequence: [
                { state: "inhale", duration: 5, text: "吸氣", subtext: "腹部慢慢隆起，深吸氣" },
                { state: "exhale", duration: 5, text: "吐氣", subtext: "腹部徐徐內縮，細吐氣" }
            ]
        },
        "sigh": {
            name: "二吸一吐 生理性嘆息",
            sequence: [
                { state: "inhale",  duration: 1.5, text: "吸氣",   subtext: "用鼻子快速深吸第一口氣" },
                { state: "inhale2", duration: 1.0, text: "再吸氣", subtext: "快速補吸第二口氣，填滿肺部" },
                { state: "exhale",  duration: 5.5, text: "慢吐氣", subtext: "用嘴徐徐長吐氣，徹底平靜" }
            ]
        }
    };

    // 系統當前狀態
    let currentMode = "478";
    let isRunning = false;
    let totalTimeLimit = 60; // 預設 1 分鐘 (秒數)
    let elapsedSeconds = 0;
    let timerInterval = null;
    let cycleStartTime = 0;
    let sequenceIndex = 0;
    let currentCycleDuration = 0;

    // 音訊狀態
    let isMuted = false;
    
    // DOM 元素選取
    const themeToggleBtn = document.getElementById("theme-toggle");
    const soundMasterBtn = document.getElementById("sound-master-btn");
    
    const modeCards = document.querySelectorAll(".mode-card");
    const durationBtns = document.querySelectorAll(".duration-btn");
    
    const breathingRing = document.getElementById("breathing-ring");
    const statusText = document.getElementById("breathing-status");
    const timerText = document.getElementById("breathing-timer");
    const subtextText = document.getElementById("breathing-subtext");
    
    const startPauseBtn = document.getElementById("start-pause-btn");
    const resetBtn = document.getElementById("reset-btn");
    const progressBarFill = document.getElementById("exercise-progress");
    const timeCurrentLabel = document.getElementById("time-current");
    const timeTotalLabel = document.getElementById("time-total");
    
    // 自訂時間 DOM (分與秒)
    const customDurationWrapper = document.getElementById("custom-duration-input-wrapper");
    const customDurationMin = document.getElementById("custom-duration-min");
    const customDurationSec = document.getElementById("custom-duration-sec");
    const customDurationApplyBtn = document.getElementById("custom-duration-apply-btn");

    // 看得出時間倒數的 SVG 圓形進度條
    const ringProgressBar = document.getElementById("ring-progress-bar");

    // 吉祥物 DOM
    const mascotContainer = document.getElementById("mascot-container");

    /* ==========================================================================
       Web Audio API：高品質合成器（提示音與白噪音）
       ========================================================================== */
    let audioCtx = null;
    let masterGainNode = null;
    let pinkNoiseBuffer = null;
    let whiteNoiseBuffer = null;

    // 安全的音訊懶加載初始化函數
    function initAudio() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGainNode = audioCtx.createGain();
            masterGainNode.gain.setValueAtTime(isMuted ? 0 : 0.8, audioCtx.currentTime);
            masterGainNode.connect(audioCtx.destination);
            
            // 延遲建立粉紅與白色噪音緩衝區
            pinkNoiseBuffer = createPinkNoiseBuffer();
            whiteNoiseBuffer = createWhiteNoiseBuffer();
            console.log("Web Audio API 與雙色噪音緩衝區初始化成功！");
        } catch (e) {
            console.error("初始化 AudioContext 失敗或被瀏覽器封鎖：", e);
        }
    }

    // 播放頌缽提示音 (Singing Bowl Synthesis)
    function playChime(state) {
        initAudio();
        if (!audioCtx || isMuted) return;
        
        if (audioCtx.state === "suspended") {
            audioCtx.resume().catch(e => console.error("喚醒音訊失敗:", e));
        }

        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        // 根據不同的呼吸狀態設計不同的優美和弦
        if (state === "inhale") {
            // 清新上揚和弦 A4 (440Hz) & C#5 (554.37Hz)
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(440, now);
            osc2.type = "triangle";
            osc2.frequency.setValueAtTime(554.37, now);
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.25, now + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        } else if (state === "inhale2") {
            // 補吸氣：更高亢清透的和弦 E5 (659.25Hz) & G#5 (830.61Hz)
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(659.25, now);
            osc2.type = "triangle";
            osc2.frequency.setValueAtTime(830.61, now);
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.22, now + 0.08);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
        } else if (state === "hold") {
            // 平靜凝聚單音 E4 (329.63Hz) & B4 (493.88Hz)
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(329.63, now);
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(493.88, now);
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.2, now + 0.15);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
        } else if (state === "exhale") {
            // 下降放鬆和弦 G4 (392Hz) & D5 (587.33Hz)
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(392, now);
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(587.33, now);
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.28, now + 0.08);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
        }

        // 低通濾波器讓聲音更柔和
        const filter = audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1000, now);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(masterGainNode);

        osc1.start(now);
        osc2.start(now);
        
        osc1.stop(now + 3);
        osc2.stop(now + 3);
    }

    // --- 自然白噪音合成器引擎 (Noise Synthesis Engine) ---
    const activeNoiseSources = {};

    // 建立粉紅噪音緩衝區
    function createPinkNoiseBuffer() {
        if (!audioCtx) return null;
        const bufferSize = 4 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        let b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
        
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;
            output[i] = pink * 0.11; // 修正增益
        }
        return noiseBuffer;
    }

    // 建立白色噪音緩衝區 (供樹葉沙沙聲使用)
    function createWhiteNoiseBuffer() {
        if (!audioCtx) return null;
        const bufferSize = 2 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        return noiseBuffer;
    }

    // 模擬逼真的鳥叫聲 (Physical Bird Chirp Synthesis)
    function playSingleBirdChirp() {
        initAudio();
        if (!audioCtx || isMuted || !activeNoiseSources["stream"]) return; 
        
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = "sine";
        
        const style = Math.random();
        if (style > 0.5) {
            osc.frequency.setValueAtTime(3200, now);
            osc.frequency.exponentialRampToValueAtTime(4600, now + 0.12);
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.06, now + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
            
            osc.connect(gainNode);
            gainNode.connect(masterGainNode);
            osc.start(now);
            osc.stop(now + 0.15);
            
            setTimeout(() => {
                if (!activeNoiseSources["stream"] || isMuted) return;
                const now2 = audioCtx.currentTime;
                const osc2 = audioCtx.createOscillator();
                const gainNode2 = audioCtx.createGain();
                
                osc2.type = "sine";
                osc2.frequency.setValueAtTime(3400, now2);
                osc2.frequency.exponentialRampToValueAtTime(5000, now2 + 0.1);
                
                gainNode2.gain.setValueAtTime(0, now2);
                gainNode2.gain.linearRampToValueAtTime(0.05, now2 + 0.02);
                gainNode2.gain.exponentialRampToValueAtTime(0.0001, now2 + 0.1);
                
                osc2.connect(gainNode2);
                gainNode2.connect(masterGainNode);
                osc2.start(now2);
                osc2.stop(now2 + 0.12);
            }, 150);
        } else {
            osc.frequency.setValueAtTime(4200, now);
            osc.frequency.linearRampToValueAtTime(3000, now + 0.06);
            osc.frequency.exponentialRampToValueAtTime(4800, now + 0.16);
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.07, now + 0.03);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
            
            osc.connect(gainNode);
            gainNode.connect(masterGainNode);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    }

    // 啟動白噪音音軌
    function startAmbientNoise(trackName, volume = 0.5) {
        initAudio();
        if (!audioCtx) return;

        if (audioCtx.state === "suspended") {
            audioCtx.resume().catch(e => console.error("無法喚醒音訊:", e));
        }

        const now = audioCtx.currentTime;
        
        const source = audioCtx.createBufferSource();
        source.buffer = pinkNoiseBuffer;
        source.loop = true;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume * 0.15, now + 1.5);

        const filter = audioCtx.createBiquadFilter();
        
        if (trackName === "rain") {
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(1000, now);
            filter.Q.setValueAtTime(1.2, now);
            
            const lfo = audioCtx.createOscillator();
            lfo.frequency.setValueAtTime(2.0, now); 
            const lfoGain = audioCtx.createGain();
            lfoGain.gain.setValueAtTime(0.03, now);
            
            lfo.connect(lfoGain);
            lfoGain.connect(gainNode.gain);
            lfo.start(now);
            
            activeNoiseSources[trackName + "_lfo"] = lfo;
            
        } else if (trackName === "waves") {
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(400, now);
            
            const lfo = audioCtx.createOscillator();
            lfo.frequency.setValueAtTime(0.125, now); 
            
            const lfoVolumeGain = audioCtx.createGain();
            lfoVolumeGain.gain.setValueAtTime(0.06, now); 
            
            const lfoFilterGain = audioCtx.createGain();
            lfoFilterGain.gain.setValueAtTime(200, now); 
            
            lfo.connect(lfoVolumeGain);
            lfoVolumeGain.connect(gainNode.gain); 
            
            lfo.connect(lfoFilterGain);
            lfoFilterGain.connect(filter.frequency); 
            
            lfo.start(now);
            
            activeNoiseSources[trackName + "_lfo"] = lfo;
            
        } else if (trackName === "fire") {
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(250, now);
            
            const crackleInterval = setInterval(() => {
                if (isMuted) return;
                const rand = Math.random();
                if (rand > 0.65) {
                    const snapNow = audioCtx.currentTime;
                    const snapOsc = audioCtx.createOscillator();
                    const snapGain = audioCtx.createGain();
                    
                    snapOsc.type = "triangle";
                    snapOsc.frequency.setValueAtTime(100 + Math.random() * 800, snapNow);
                    
                    snapGain.gain.setValueAtTime(0.03 * Math.random(), snapNow);
                    snapGain.gain.exponentialRampToValueAtTime(0.0001, snapNow + 0.02 + Math.random() * 0.05);
                    
                    snapOsc.connect(snapGain);
                    snapGain.connect(masterGainNode);
                    snapOsc.start(snapNow);
                    snapOsc.stop(snapNow + 0.1);
                }
            }, 150);
            
            activeNoiseSources[trackName + "_crackle"] = crackleInterval;
        }
        
        else if (trackName === "breeze") {
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(500, now);
            
            const lfo = audioCtx.createOscillator();
            lfo.frequency.setValueAtTime(0.07, now);
            
            const lfoVolumeGain = audioCtx.createGain();
            lfoVolumeGain.gain.setValueAtTime(0.04, now); 
            
            const lfoFilterGain = audioCtx.createGain();
            lfoFilterGain.gain.setValueAtTime(350, now); 
            
            lfo.connect(lfoVolumeGain);
            lfoVolumeGain.connect(gainNode.gain);
            lfo.connect(lfoFilterGain);
            lfoFilterGain.connect(filter.frequency);
            lfo.start(now);
            
            activeNoiseSources[trackName + "_lfo"] = lfo;

            const leafSource = audioCtx.createBufferSource();
            leafSource.buffer = whiteNoiseBuffer;
            leafSource.loop = true;

            const leafFilter = audioCtx.createBiquadFilter();
            leafFilter.type = "highpass";
            leafFilter.frequency.setValueAtTime(6000, now); 

            const leafGain = audioCtx.createGain();
            leafGain.gain.setValueAtTime(0.002, now); 

            lfoVolumeGain.connect(leafGain.gain);

            leafSource.connect(leafFilter);
            leafFilter.connect(leafGain);
            leafGain.connect(masterGainNode);
            leafSource.start(now);

            activeNoiseSources[trackName + "_leaf"] = leafSource;
        } 
        
        else if (trackName === "stream") {
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(850, now);
            filter.Q.setValueAtTime(1.5, now);
            
            const lfo = audioCtx.createOscillator();
            lfo.frequency.setValueAtTime(6.0, now); 
            const lfoGain = audioCtx.createGain();
            lfoGain.gain.setValueAtTime(0.02, now); 
            
            lfo.connect(lfoGain);
            lfoGain.connect(gainNode.gain);
            lfo.start(now);
            
            activeNoiseSources[trackName + "_lfo"] = lfo;

            const birdsTimer = setInterval(() => {
                if (Math.random() > 0.3) {
                    playSingleBirdChirp();
                }
            }, 6000);
            
            activeNoiseSources[trackName + "_timer"] = birdsTimer;
        }

        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(masterGainNode);
        
        source.start(now);

        activeNoiseSources[trackName] = {
            source: source,
            gainNode: gainNode,
            filter: filter,
            baseVol: volume
        };
        
        if (trackName === "stream") {
            setTimeout(playSingleBirdChirp, 800);
        }
    }

    // 關閉白噪音音軌
    function stopAmbientNoise(trackName) {
        if (!audioCtx) return;
        const track = activeNoiseSources[trackName];
        if (track) {
            const now = audioCtx.currentTime;
            track.gainNode.gain.cancelScheduledValues(now);
            track.gainNode.gain.setValueAtTime(track.gainNode.gain.value, now);
            track.gainNode.gain.linearRampToValueAtTime(0, now + 1.0);
            
            setTimeout(() => {
                try { track.source.stop(); } catch(e) {}
                
                if (activeNoiseSources[trackName + "_lfo"]) {
                    try { activeNoiseSources[trackName + "_lfo"].stop(); } catch(e) {}
                    delete activeNoiseSources[trackName + "_lfo"];
                }
                if (activeNoiseSources[trackName + "_leaf"]) {
                    try { activeNoiseSources[trackName + "_leaf"].stop(); } catch(e) {}
                    delete activeNoiseSources[trackName + "_leaf"];
                }
                if (activeNoiseSources[trackName + "_crackle"]) {
                    clearInterval(activeNoiseSources[trackName + "_crackle"]);
                    delete activeNoiseSources[trackName + "_crackle"];
                }
                if (activeNoiseSources[trackName + "_timer"]) {
                    clearInterval(activeNoiseSources[trackName + "_timer"]);
                    delete activeNoiseSources[trackName + "_timer"];
                }
                
                delete activeNoiseSources[trackName];
            }, 1100);
        }
    }

    // 調整特定音軌音量
    function setAmbientVolume(trackName, volume) {
        if (!audioCtx) return;
        const track = activeNoiseSources[trackName];
        if (track) {
            track.baseVol = volume;
            const now = audioCtx.currentTime;
            track.gainNode.gain.linearRampToValueAtTime(volume * 0.15, now + 0.2);
        }
    }

    /* ==========================================================================
       呼吸練習計時核心引擎 (Breathing Engine)
       ========================================================================== */
    
    // 初始化設定與倒數計時顯示
    function initDisplay() {
        statusText.textContent = "準備就緒";
        timerText.textContent = "0.0";
        subtextText.textContent = "點擊下方按鈕開始練習";
        
        breathingRing.className = "breathing-ring-element hold-state";
        
        // 重設看得出倒數時間的圓形進度環為滿格 (0 表示沒有 stroke-dashoffset 的偏移量)
        if (ringProgressBar) {
            ringProgressBar.style.strokeDashoffset = "0";
        }
        
        progressBarFill.style.width = "0%";
        
        elapsedSeconds = 0;
        timeCurrentLabel.textContent = "00:00";
        
        if (totalTimeLimit === "infinite") {
            timeTotalLabel.textContent = "/ 無限制";
        } else {
            timeTotalLabel.textContent = `/ ${formatMMSS(totalTimeLimit)}`;
        }
    }

    // 開始或暫停練習
    function toggleExercise() {
        console.log("toggleExercise 被呼叫！當前 isRunning =", isRunning);
        if (isRunning) {
            pauseExercise();
        } else {
            startExercise();
        }
    }

    // 開始練習
    function startExercise() {
        console.log("startExercise 被呼叫！");
        initAudio();
        if (audioCtx && audioCtx.state === "suspended") {
            audioCtx.resume()
                .then(() => console.log("AudioContext 成功喚醒"))
                .catch(err => console.error("喚醒 AudioContext 失敗：", err));
        }
        
        isRunning = true;
        startPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> <span>暫停練習</span>';
        startPauseBtn.classList.remove("pulse-effect");
        resetBtn.disabled = false;
        
        disableControls(true);
        
        cycleStartTime = Date.now();
        sequenceIndex = 0;
        
        try {
            console.log("執行首次 runBreathingCycle()...");
            runBreathingCycle();
            console.log("首次 runBreathingCycle() 執行完畢");
        } catch (e) {
            console.error("執行 runBreathingCycle 發生錯誤：", e);
        }
        
        // 啟動主計時器
        let lastTick = Date.now();
        console.log("啟動主計時器 setInterval...");
        timerInterval = setInterval(() => {
            const now = Date.now();
            const delta = (now - lastTick) / 1000;
            lastTick = now;
            
            elapsedSeconds += delta;
            
            updateOverallProgress();
            
            if (totalTimeLimit !== "infinite" && elapsedSeconds >= totalTimeLimit) {
                finishExercise();
            } else {
                updateCycleCountdown();
            }
        }, 100);
        console.log("主計時器啟動成功，ID =", timerInterval);
    }

    // 暫停練習
    function pauseExercise() {
        console.log("pauseExercise 被呼叫！");
        isRunning = false;
        startPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>繼續練習</span>';
        startPauseBtn.classList.add("pulse-effect");
        
        console.log("清除主計時器，ID =", timerInterval);
        clearInterval(timerInterval);
        
        breathingRing.className = "breathing-ring-element hold-state";
        statusText.textContent = "已暫停";
        subtextText.textContent = "點擊繼續以繼續引導";
    }

    // 重設練習
    function resetExercise() {
        isRunning = false;
        clearInterval(timerInterval);
        
        startPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>開始練習</span>';
        startPauseBtn.classList.add("pulse-effect");
        resetBtn.disabled = true;
        
        disableControls(false);
        initDisplay();
    }

    // 關閉或開啟面板設定
    function disableControls(disable) {
        modeCards.forEach(card => {
            if (disable) {
                card.style.pointerEvents = "none";
                card.style.opacity = card.classList.contains("active") ? "1" : "0.5";
            } else {
                card.style.pointerEvents = "auto";
                card.style.opacity = "1";
            }
        });
        
        durationBtns.forEach(btn => {
            if (disable) {
                btn.style.pointerEvents = "none";
                btn.style.opacity = btn.classList.contains("active") ? "1" : "0.5";
            } else {
                btn.style.pointerEvents = "auto";
                btn.style.opacity = "1";
            }
        });

        // 鎖定自訂時間輸入 (分與秒)
        customDurationMin.disabled = disable;
        customDurationSec.disabled = disable;
        customDurationApplyBtn.disabled = disable;
        if (disable) {
            customDurationMin.style.opacity = "0.5";
            customDurationSec.style.opacity = "0.5";
            customDurationApplyBtn.style.opacity = "0.5";
            customDurationApplyBtn.style.pointerEvents = "none";
        } else {
            customDurationMin.style.opacity = "1";
            customDurationSec.style.opacity = "1";
            customDurationApplyBtn.style.opacity = "1";
            customDurationApplyBtn.style.pointerEvents = "auto";
        }
    }

    // 當前呼吸週期的流程控制
    function runBreathingCycle() {
        if (!isRunning) return;
        
        const modeData = BREATH_MODES[currentMode];
        const step = modeData.sequence[sequenceIndex];
        
        // 更新呼吸環視覺類別
        breathingRing.className = `breathing-ring-element ${step.state}-state`;
        statusText.textContent = step.text;
        subtextText.textContent = step.subtext;
        
        currentCycleDuration = step.duration;
        cycleStartTime = Date.now();
        
        // 播放呼吸狀態切換的頌缽音效
        playChime(step.state);
    }

    // 更新當前呼吸步驟的秒數倒數與圓形進度色環
    function updateCycleCountdown() {
        const elapsed = (Date.now() - cycleStartTime) / 1000;
        const remaining = Math.max(0, currentCycleDuration - elapsed);
        
        timerText.textContent = remaining.toFixed(1);
        
        // --- 核心升級：看得出時間倒數的色環進度消逝計算 ---
        if (ringProgressBar) {
            const progress = remaining / currentCycleDuration; // 1.0 (滿格) -> 0.0 (空格)
            const strokeDashoffset = 289 * (1 - progress);     // 0 (滿格) -> 289 (空格)
            ringProgressBar.style.strokeDashoffset = strokeDashoffset;
        }
        
        if (remaining <= 0) {
            const modeData = BREATH_MODES[currentMode];
            sequenceIndex = (sequenceIndex + 1) % modeData.sequence.length;
            runBreathingCycle();
        }
    }

    // 更新總練習進度條與標籤
    function updateOverallProgress() {
        timeCurrentLabel.textContent = formatMMSS(Math.floor(elapsedSeconds));
        
        if (totalTimeLimit !== "infinite") {
            const progressPercent = Math.min(100, (elapsedSeconds / totalTimeLimit) * 100);
            progressBarFill.style.width = `${progressPercent}%`;
        } else {
            progressBarFill.style.width = `${(elapsedSeconds % 10) * 10}%`;
        }
    }

    // 圓滿完成練習
    function finishExercise() {
        isRunning = false;
        clearInterval(timerInterval);
        
        startPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>開始練習</span>';
        startPauseBtn.classList.add("pulse-effect");
        resetBtn.disabled = true;
        
        disableControls(false);
        
        playChime("inhale");
        setTimeout(() => { playChime("hold"); }, 200);
        
        alert("恭喜！您已成功完成本次呼吸實修！🧘‍♂️");
        
        initDisplay();
    }

    /* ==========================================================================
       吉祥物自由拖曳定位系統 (Universal Draggable Mascot)
       ========================================================================== */
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    // 初始化吉祥物位置
    function initMascotPosition() {
        const savedPos = JSON.parse(localStorage.getItem("mascot_position"));
        
        if (savedPos) {
            const left = Math.min(window.innerWidth - 130, Math.max(10, savedPos.left));
            const top = Math.min(window.innerHeight - 150, Math.max(10, savedPos.top));
            
            mascotContainer.style.left = `${left}px`;
            mascotContainer.style.top = `${top}px`;
            mascotContainer.style.bottom = "auto";
        } else {
            const defaultLeft = 24;
            const defaultTop = window.innerHeight - 180;
            mascotContainer.style.left = `${defaultLeft}px`;
            mascotContainer.style.top = `${defaultTop}px`;
            mascotContainer.style.bottom = "auto";
        }
    }

    // 拖曳開始事件
    function dragStart(e) {
        isDragging = true;
        
        const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
        
        const rect = mascotContainer.getBoundingClientRect();
        
        dragStartX = clientX - rect.left;
        dragStartY = clientY - rect.top;
        
        mascotContainer.classList.add("dragging");
        
        if (e.cancelable) e.preventDefault();
    }

    // 拖曳進行中
    function dragMove(e) {
        if (!isDragging) return;
        
        const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        
        let left = clientX - dragStartX;
        let top = clientY - dragStartY;
        
        const maxLeft = window.innerWidth - mascotContainer.offsetWidth - 10;
        const maxTop = window.innerHeight - mascotContainer.offsetHeight - 10;
        
        left = Math.max(10, Math.min(left, maxLeft));
        top = Math.max(10, Math.min(top, maxTop));
        
        mascotContainer.style.left = `${left}px`;
        mascotContainer.style.top = `${top}px`;
    }

    // 拖曳結束
    function dragEnd() {
        if (!isDragging) return;
        isDragging = false;
        mascotContainer.classList.remove("dragging");
        
        const rect = mascotContainer.getBoundingClientRect();
        localStorage.setItem("mascot_position", JSON.stringify({
            left: rect.left,
            top: rect.top
        }));
    }

    // 綁定吉祥物拖曳監聽事件
    mascotContainer.addEventListener("mousedown", dragStart);
    document.addEventListener("mousemove", dragMove);
    document.addEventListener("mouseup", dragEnd);

    mascotContainer.addEventListener("touchstart", dragStart, { passive: false });
    document.addEventListener("touchmove", dragMove, { passive: false });
    document.addEventListener("touchend", dragEnd);

    window.addEventListener("resize", () => {
        const rect = mascotContainer.getBoundingClientRect();
        const maxLeft = window.innerWidth - mascotContainer.offsetWidth - 10;
        const maxTop = window.innerHeight - mascotContainer.offsetHeight - 10;
        
        if (rect.left > maxLeft || rect.top > maxTop) {
            const newLeft = Math.max(10, Math.min(rect.left, maxLeft));
            const newTop = Math.max(10, Math.min(rect.top, maxTop));
            mascotContainer.style.left = `${newLeft}px`;
            mascotContainer.style.top = `${newTop}px`;
        }
    });

    /* ==========================================================================
       環境白噪音與控制項交互
       ========================================================================== */
    
    function updateSliderFill(slider) {
        const valVal = parseFloat(slider.value);
        const percent = valVal * 100;
        slider.style.setProperty('--percent', `${percent}%`);
    }

    // 初始化環境音軌控制
    document.querySelectorAll(".track-card").forEach(card => {
        const trackName = card.dataset.track;
        const toggleBtn = card.querySelector(".track-toggle-btn");
        const volumeSlider = card.querySelector(".volume-slider");
        const statusSpan = card.querySelector(".track-status");
        
        updateSliderFill(volumeSlider);

        toggleBtn.addEventListener("click", () => {
            const isActive = card.classList.contains("active");
            
            if (isActive) {
                card.classList.remove("active");
                toggleBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                statusSpan.textContent = "已關閉";
                stopAmbientNoise(trackName);
            } else {
                card.classList.add("active");
                toggleBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
                statusSpan.textContent = `播放中 (${Math.round(volumeSlider.value * 100)}%)`;
                startAmbientNoise(trackName, parseFloat(volumeSlider.value));
            }
        });
        
        volumeSlider.addEventListener("input", () => {
            updateSliderFill(volumeSlider);
            const volVal = parseFloat(volumeSlider.value);
            if (card.classList.contains("active")) {
                statusSpan.textContent = `播放中 (${Math.round(volVal * 100)}%)`;
                setAmbientVolume(trackName, volVal);
            } else {
                statusSpan.textContent = `已關閉 (${Math.round(volVal * 100)}%)`;
            }
        });
    });

    /* ==========================================================================
       全域控制與主題切換
       ========================================================================== */
    
    soundMasterBtn.addEventListener("click", () => {
        isMuted = !isMuted;
        initAudio();
        if (audioCtx && masterGainNode) {
            if (isMuted) {
                masterGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                soundMasterBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
                soundMasterBtn.style.background = "#ef4444";
                soundMasterBtn.style.borderColor = "#ef4444";
            } else {
                masterGainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
                soundMasterBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
                soundMasterBtn.style.background = "rgba(255, 255, 255, 0.05)";
                soundMasterBtn.style.borderColor = "rgba(255, 255, 255, 0.08)";
            }
        } else {
            // 如果 Web Audio API 被瀏覽器禁用或失敗，純介面切換防護
            if (isMuted) {
                soundMasterBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
                soundMasterBtn.style.background = "#ef4444";
                soundMasterBtn.style.borderColor = "#ef4444";
            } else {
                soundMasterBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
                soundMasterBtn.style.background = "rgba(255, 255, 255, 0.05)";
                soundMasterBtn.style.borderColor = "rgba(255, 255, 255, 0.08)";
            }
        }
    });

    const THEMES = ["default", "cosmic", "forest"];
    let currentThemeIdx = 0;

    themeToggleBtn.addEventListener("click", () => {
        document.body.classList.remove("cosmic-theme", "forest-theme");
        
        currentThemeIdx = (currentThemeIdx + 1) % THEMES.length;
        const nextTheme = THEMES[currentThemeIdx];
        
        if (nextTheme === "cosmic") {
            document.body.classList.add("cosmic-theme");
        } else if (nextTheme === "forest") {
            document.body.classList.add("forest-theme");
        }
    });

    /* ==========================================================================
       事件綁定與初始化
       ========================================================================== */
    
    // 呼吸模式切換
    modeCards.forEach(card => {
        card.addEventListener("click", () => {
            if (isRunning) return;
            
            modeCards.forEach(c => c.classList.remove("active"));
            card.classList.add("active");
            
            currentMode = card.dataset.mode;
            initDisplay();
        });
    });

    // 練習時間長度切換
    durationBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            if (isRunning) return;
            
            durationBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const dur = btn.dataset.duration;
            
            if (dur === "custom") {
                customDurationWrapper.classList.add("show");
                applyCustomDuration();
            } else {
                customDurationWrapper.classList.remove("show");
                if (dur === "infinite") {
                    totalTimeLimit = "infinite";
                } else {
                    totalTimeLimit = parseInt(dur);
                }
                initDisplay();
            }
        });
    });

    // 自訂時長套用邏輯 (分與秒換算)
    function applyCustomDuration(showFeedback = false) {
        let mins = parseInt(customDurationMin.value);
        let secs = parseInt(customDurationSec.value);
        
        if (isNaN(mins) || mins < 0) {
            mins = 0;
            customDurationMin.value = 0;
        }
        if (isNaN(secs) || secs < 0) {
            secs = 0;
            customDurationSec.value = 0;
        }
        
        // 如果秒數大於 59，自動進位至分鐘
        if (secs > 59) {
            mins += Math.floor(secs / 60);
            secs = secs % 60;
            customDurationSec.value = secs;
            customDurationMin.value = mins;
        }
        
        let totalSecs = mins * 60 + secs;
        
        // 防呆校正：最少 5 秒，最多 2 小時 (7200秒)
        if (totalSecs < 5) {
            totalSecs = 5;
            customDurationMin.value = 0;
            customDurationSec.value = 5;
        } else if (totalSecs > 7200) {
            totalSecs = 7200;
            customDurationMin.value = 120;
            customDurationSec.value = 0;
        }
        
        totalTimeLimit = totalSecs;
        initDisplay();

        // 觸發確認按鈕的剔透勾號反饋
        if (showFeedback) {
            const originalContent = customDurationApplyBtn.innerHTML;
            customDurationApplyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
            customDurationApplyBtn.style.background = "#10b981"; 
            customDurationApplyBtn.style.boxShadow = "0 0 10px rgba(16, 185, 129, 0.5)";
            
            setTimeout(() => {
                customDurationApplyBtn.innerHTML = originalContent;
                customDurationApplyBtn.style.background = ""; 
                customDurationApplyBtn.style.boxShadow = "";
            }, 1200);
        }
    }

    // 綁定確認套用自訂時間按鈕
    customDurationApplyBtn.addEventListener("click", () => {
        applyCustomDuration(true);
    });

    // 監聽輸入框的 Enter 鍵與失焦事件
    [customDurationMin, customDurationSec].forEach(input => {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                applyCustomDuration(true);
                input.blur();
            }
        });
        input.addEventListener("blur", () => {
            applyCustomDuration(false);
        });
    });

    // 核心按鈕綁定
    startPauseBtn.addEventListener("click", toggleExercise);
    resetBtn.addEventListener("click", resetExercise);
    
    // 呼吸指示環點擊也可以啟動
    breathingRing.addEventListener("click", () => {
        if (!isRunning || statusText.textContent === "已暫停") {
            toggleExercise();
        }
    });

    /* ==========================================================================
       輔助函式與啟動初始化
       ========================================================================== */
    
    // 秒數轉換 MM:SS 格式
    function formatMMSS(secNum) {
        const mins = Math.floor(secNum / 60);
        const secs = secNum % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // 應用程式初始化啟動
    initMascotPosition();
    initDisplay();
});
