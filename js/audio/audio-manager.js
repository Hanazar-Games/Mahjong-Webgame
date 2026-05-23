/**
 * 万能麻将 - 极致音频引擎 (Maximized SFX)
 * 使用Web Audio API + 高级合成技术
 */

const AudioManager = (function() {
    'use strict';

    let audioCtx = null;
    let masterGain = null;
    let bgmGain = null;
    let sfxGain = null;
    let isMuted = false;
    let bgmVolume = 0.5;
    let sfxVolume = 0.5;
    let bgmPlaying = false;
    let currentBgm = null;
    let bgmTimer = null;
    let sfxEnabled = true;

    // 音频缓存（避免重复创建）
    const audioCache = new Map();

    function init() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.connect(audioCtx.destination);
            masterGain.gain.value = 1;

            bgmGain = audioCtx.createGain();
            bgmGain.connect(masterGain);
            bgmGain.gain.value = bgmVolume;

            sfxGain = audioCtx.createGain();
            sfxGain.connect(masterGain);
            sfxGain.gain.value = sfxVolume;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    function resume() {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    // ============ 高级合成器 ============

    /**
     * FM合成器 - 用于丰富音色
     */
    function playFM(options = {}) {
        if (!audioCtx || !sfxEnabled) return;
        const {
            carrier = 440,
            modulator = 220,
            modulationIndex = 100,
            attack = 0.01,
            decay = 0.1,
            sustain = 0.3,
            release = 0.5,
            volume = 0.3
        } = options;

        const now = audioCtx.currentTime;

        // 载波
        const carrierOsc = audioCtx.createOscillator();
        carrierOsc.frequency.value = carrier;

        // 调制器
        const modOsc = audioCtx.createOscillator();
        modOsc.frequency.value = modulator;

        const modGain = audioCtx.createGain();
        modGain.gain.value = modulationIndex;

        const envelope = audioCtx.createGain();
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(volume * sfxVolume, now + attack);
        envelope.gain.exponentialRampToValueAtTime(volume * sfxVolume * sustain, now + attack + decay);
        envelope.gain.exponentialRampToValueAtTime(0.001, now + attack + decay + release);

        modOsc.connect(modGain);
        modGain.connect(carrierOsc.frequency);
        carrierOsc.connect(envelope);
        envelope.connect(sfxGain);

        carrierOsc.start(now);
        modOsc.start(now);
        carrierOsc.stop(now + attack + decay + release + 0.1);
        modOsc.stop(now + attack + decay + release + 0.1);
    }

    /**
     * 噪声合成器 - 用于滑动/碰撞声
     */
    function playNoise(options = {}) {
        if (!audioCtx || !sfxEnabled) return;
        const {
            duration = 0.2,
            frequency = 1000,
            type = 'bandpass',
            volume = 0.3,
            attack = 0.01,
            decay = 0.15
        } = options;

        const now = audioCtx.currentTime;
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = 5;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume * sfxVolume, now + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(sfxGain);
        noise.start(now);
        noise.stop(now + duration);
    }

    /**
     * 打击合成器
     */
    function playPerc(options = {}) {
        if (!audioCtx || !sfxEnabled) return;
        const {
            freq = 200,
            decay = 0.15,
            type = 'sine',
            pitchDrop = 100,
            volume = 0.5,
            harmonics = []
        } = options;

        const now = audioCtx.currentTime;
        const mainOsc = audioCtx.createOscillator();
        mainOsc.type = type;
        mainOsc.frequency.setValueAtTime(freq, now);
        mainOsc.frequency.exponentialRampToValueAtTime(Math.max(freq - pitchDrop, 50), now + decay);

        const mainGain = audioCtx.createGain();
        mainGain.gain.setValueAtTime(volume * sfxVolume, now);
        mainGain.gain.exponentialRampToValueAtTime(0.001, now + decay);

        mainOsc.connect(mainGain);
        mainGain.connect(sfxGain);
        mainOsc.start(now);
        mainOsc.stop(now + decay + 0.05);

        // 添加泛音
        harmonics.forEach((h, i) => {
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq * h.freq;
            const g = audioCtx.createGain();
            g.gain.setValueAtTime(volume * sfxVolume * h.amp, now + h.delay);
            g.gain.exponentialRampToValueAtTime(0.001, now + decay * 0.8);
            osc.connect(g);
            g.connect(sfxGain);
            osc.start(now + h.delay);
            osc.stop(now + decay + 0.05);
        });
    }

    /**
     * 和弦合成器
     */
    function playChord(freqs, options = {}) {
        if (!audioCtx || !sfxEnabled) return;
        const { duration = 0.5, volume = 0.4, type = 'sine', stagger = 0.04 } = options;
        const now = audioCtx.currentTime;

        freqs.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;

            const t = now + i * stagger;
            const attack = 0.02;
            const rel = duration - attack;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(volume * sfxVolume * 0.3, t + attack);
            g.gain.exponentialRampToValueAtTime(0.001, t + attack + rel);

            osc.connect(g);
            g.connect(sfxGain);
            osc.start(t);
            osc.stop(t + attack + rel + 0.05);
        });
    }

    /**
     * 铃铛合成器
     */
    function playBell(freq, options = {}) {
        if (!audioCtx || !sfxEnabled) return;
        const { duration = 1.5, volume = 0.4 } = options;
        const now = audioCtx.currentTime;

        const fundamental = audioCtx.createOscillator();
        fundamental.type = 'sine';
        fundamental.frequency.value = freq;

        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(volume * sfxVolume * 0.5, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);

        fundamental.connect(g);
        g.connect(sfxGain);
        fundamental.start(now);
        fundamental.stop(now + duration);

        // 泛音
        [1.5, 2, 2.5, 3].forEach((ratio, i) => {
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq * ratio;
            const g2 = audioCtx.createGain();
            g2.gain.setValueAtTime(0, now + i * 0.05);
            g2.gain.linearRampToValueAtTime(volume * sfxVolume * 0.15 / ratio, now + i * 0.05 + 0.03);
            g2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);
            osc.connect(g2);
            g2.connect(sfxGain);
            osc.start(now + i * 0.05);
            osc.stop(now + duration);
        });
    }

    // ============ 游戏音效库 ============

    const SFX = {
        // 摸牌 - 根据花色有不同音效
        draw(tile) {
            if (!tile) {
                playNoise({ duration: 0.15, frequency: 500, volume: 0.3 });
                return;
            }
            const suitFreqs = { wan: 400, tong: 550, tiao: 700, feng: 350, jian: 450, hua: 600 };
            const freq = suitFreqs[tile.suit] || 500;
            playNoise({ duration: 0.12, frequency: freq, volume: 0.25, type: 'bandpass' });
            // 轻微共振
            playPerc({ freq: freq * 2, decay: 0.08, volume: 0.15, pitchDrop: 50 });
        },

        // 打牌 - 落桌声
        discard(tile) {
            const suitFreqs = { wan: 200, tong: 260, tiao: 320, feng: 180, jian: 220, hua: 350 };
            const freq = suitFreqs[tile?.suit] || 250;
            playPerc({
                freq, decay: 0.1, type: 'triangle',
                pitchDrop: 80, volume: 0.5,
                harmonics: [{ freq: 2, amp: 0.3, delay: 0.01 }]
            });
            // 桌面共振
            setTimeout(() => {
                playPerc({ freq: freq * 0.5, decay: 0.2, type: 'sine', pitchDrop: 30, volume: 0.2 });
            }, 30);
        },

        // 选中牌
        selectTile() {
            playFM({ carrier: 1200, modulator: 600, modulationIndex: 50, attack: 0.005, decay: 0.03, sustain: 0, release: 0.05, volume: 0.2 });
        },

        // 取消选中
        deselectTile() {
            playFM({ carrier: 800, modulator: 400, modulationIndex: 30, attack: 0.005, decay: 0.03, sustain: 0, release: 0.05, volume: 0.15 });
        },

        // 吃 - 轻快三连音
        chi() {
            playChord([523, 659, 784], { duration: 0.25, volume: 0.5, type: 'triangle', stagger: 0.03 });
            setTimeout(() => playPerc({ freq: 1047, decay: 0.08, type: 'sine', volume: 0.2 }), 80);
        },

        // 碰 - 有力双音
        peng() {
            playChord([440, 554], { duration: 0.3, volume: 0.55, type: 'square', stagger: 0 });
            setTimeout(() => {
                playPerc({ freq: 880, decay: 0.12, type: 'triangle', volume: 0.3 });
                playChord([440, 554], { duration: 0.2, volume: 0.3, stagger: 0 });
            }, 100);
        },

        // 杠 - 深沉有力
        gang() {
            playPerc({ freq: 150, decay: 0.4, type: 'sawtooth', pitchDrop: 50, volume: 0.6 });
            playChord([196, 247, 293], { duration: 0.5, volume: 0.5, type: 'square', stagger: 0.05 });
            setTimeout(() => playPerc({ freq: 100, decay: 0.5, type: 'sine', volume: 0.4 }), 150);
        },

        // 暗杠
        anGang() {
            playPerc({ freq: 200, decay: 0.3, type: 'triangle', pitchDrop: 40, volume: 0.5 });
            playChord([261, 329, 392], { duration: 0.4, volume: 0.4, type: 'sine', stagger: 0.06 });
        },

        // 胡 - 胜利钟声
        hu() {
            playBell(523, { duration: 1.5, volume: 0.7 });
            setTimeout(() => playBell(659, { duration: 1.2, volume: 0.5 }), 150);
            setTimeout(() => playBell(784, { duration: 1.8, volume: 0.6 }), 300);
            setTimeout(() => playBell(1047, { duration: 2.5, volume: 0.4 }), 500);
        },

        // 自摸 - 华丽庆祝
        ziMo() {
            playBell(587, { duration: 0.8, volume: 0.6 });
            setTimeout(() => playBell(740, { duration: 0.8, volume: 0.6 }), 80);
            setTimeout(() => playBell(880, { duration: 1, volume: 0.7 }), 160);
            setTimeout(() => playBell(1175, { duration: 2, volume: 0.5 }), 350);
            // 鼓点
            [0, 200, 400, 600, 800].forEach((t, i) => {
                setTimeout(() => playPerc({ freq: 120 + i * 30, decay: 0.15, type: 'sine', volume: 0.25 }), t);
            });
        },

        // 流局
        drawGame() {
            playChord([392, 349, 329], { duration: 1, volume: 0.4, type: 'sine' });
            setTimeout(() => playChord([329, 293, 261], { duration: 1.2, volume: 0.3, type: 'triangle' }), 400);
        },

        // 游戏开始
        gameStart() {
            const notes = [523, 587, 659, 784];
            notes.forEach((freq, i) => {
                setTimeout(() => playBell(freq, { duration: 0.6, volume: 0.4 }), i * 120);
            });
        },

        // 游戏结束
        gameEnd(isWin) {
            if (isWin) {
                [523, 587, 659, 784, 659, 784, 1047].forEach((freq, i) => {
                    setTimeout(() => playBell(freq, { duration: 0.5, volume: 0.5 }), i * 120);
                });
            } else {
                playChord([440, 392, 349], { duration: 1.2, volume: 0.35 });
            }
        },

        // 按钮点击
        buttonClick() {
            playFM({ carrier: 1500, modulator: 750, modulationIndex: 100, attack: 0.003, decay: 0.04, sustain: 0, release: 0.03, volume: 0.25 });
        },

        // 开关切换
        toggleSwitch() {
            playFM({ carrier: 2000, modulator: 1000, modulationIndex: 200, attack: 0.002, decay: 0.05, volume: 0.2 });
        },

        // 滑动条
        sliderChange() {
            playFM({ carrier: 800 + Math.random() * 400, modulator: 400, modulationIndex: 50, attack: 0.002, decay: 0.03, volume: 0.1 });
        },

        // 警告
        warning() {
            playPerc({ freq: 350, decay: 0.25, type: 'sawtooth', pitchDrop: 100, volume: 0.4 });
            setTimeout(() => playPerc({ freq: 300, decay: 0.3, type: 'sawtooth', pitchDrop: 80, volume: 0.4 }), 120);
        },

        // 错误
        error() {
            playPerc({ freq: 200, decay: 0.4, type: 'sawtooth', pitchDrop: 100, volume: 0.5 });
            setTimeout(() => playPerc({ freq: 180, decay: 0.5, type: 'square', pitchDrop: 50, volume: 0.4 }), 150);
        },

        // 滴答 - 倒计时
        tick() {
            playPerc({ freq: 2200, decay: 0.015, type: 'sine', volume: 0.12 });
        },

        // 倒计时紧急
        tickUrgent() {
            playPerc({ freq: 2800, decay: 0.02, type: 'sine', volume: 0.2 });
            playPerc({ freq: 1400, decay: 0.03, type: 'triangle', volume: 0.15 });
        },

        // 倒计时结束
        tickEnd() {
            playPerc({ freq: 800, decay: 0.3, type: 'sawtooth', pitchDrop: 300, volume: 0.4 });
        },

        // 解锁成就
        achievement() {
            [0, 80, 160, 280, 400].forEach((t, i) => {
                setTimeout(() => playBell(523 * Math.pow(1.12, i), { duration: 0.5, volume: 0.45 }), t);
            });
        },

        // 升级
        levelUp() {
            [523, 587, 659, 784, 880, 1047].forEach((freq, i) => {
                setTimeout(() => playBell(freq, { duration: 0.4, volume: 0.5 }), i * 80);
            });
        },

        // 花牌
        flower() {
            playBell(880, { duration: 0.6, volume: 0.35 });
            setTimeout(() => playBell(1100, { duration: 0.5, volume: 0.3 }), 100);
        },

        // 屏幕切换
        screenSwitch() {
            playNoise({ duration: 0.2, frequency: 200, type: 'lowpass', volume: 0.15 });
        },

        // 弹出菜单
        menuOpen() {
            playChord([300, 450], { duration: 0.15, volume: 0.25, type: 'sine' });
        },

        // 关闭菜单
        menuClose() {
            playChord([450, 300], { duration: 0.12, volume: 0.2, type: 'sine' });
        },

        // 模态框弹出
        modalOpen() {
            playPerc({ freq: 600, decay: 0.15, type: 'sine', pitchDrop: 200, volume: 0.25 });
        },

        // 金币/分数增加
        scoreUp() {
            playPerc({ freq: 1200, decay: 0.08, type: 'sine', pitchDrop: 400, volume: 0.2 });
            setTimeout(() => playPerc({ freq: 1600, decay: 0.06, type: 'sine', volume: 0.15 }), 50);
        },

        // 金币/分数减少
        scoreDown() {
            playPerc({ freq: 600, decay: 0.1, type: 'sine', pitchDrop: 200, volume: 0.2 });
        },

        // 连击
        combo(count) {
            const baseFreq = 500 + count * 100;
            playBell(baseFreq, { duration: 0.4, volume: 0.4 });
            if (count > 2) {
                setTimeout(() => playBell(baseFreq * 1.25, { duration: 0.3, volume: 0.3 }), 80);
            }
        },

        // 回合开始
        turnStart() {
            playPerc({ freq: 440, decay: 0.08, type: 'sine', volume: 0.2 });
        },

        // 风标变化
        windChange() {
            playNoise({ duration: 0.3, frequency: 300, type: 'lowpass', volume: 0.2 });
        },

        // 牌进入弃牌堆
        toDiscard() {
            playPerc({ freq: 180, decay: 0.06, type: 'triangle', volume: 0.15 });
        },

        // 3D翻转
        flip3D() {
            playNoise({ duration: 0.15, frequency: 800, type: 'bandpass', volume: 0.2 });
        }
    };

    // ============ BGM 系统 ============

    const PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
    const MINOR_PENTATONIC = [311.13, 349.23, 392.00, 466.16, 523.25];

    const BGM_PATTERNS = {
        calm: {
            notes: [
                [0, 2, 4, 2, 0, 2, 4, 5],
                [4, 2, 0, 2, 4, 5, 4, 2],
                [0, 2, 4, 5, 4, 2, 0, -1],
                [5, 4, 2, 0, -1, 0, 2, 4]
            ],
            scale: PENTATONIC,
            tempo: 0.55,
            type: 'sine',
            harmony: true
        },
        upbeat: {
            notes: [
                [0, 2, 4, 4, 2, 0, 2, 4],
                [5, 4, 2, 0, 2, 4, 5, 5],
                [4, 5, 4, 2, 0, -1, 0, 2]
            ],
            scale: PENTATONIC.map(f => f * 1.5),
            tempo: 0.35,
            type: 'triangle',
            harmony: false
        },
        zen: {
            notes: [
                [0, -1, 2, -1, 4, -1, 2, -1],
                [4, -1, 5, -1, 4, 2, 0, -1]
            ],
            scale: MINOR_PENTATONIC,
            tempo: 0.8,
            type: 'sine',
            harmony: true
        }
    };

    function startBgm(style = 'calm') {
        if (!audioCtx) init();
        if (!audioCtx) return;
        resume();
        stopBgm();
        bgmPlaying = true;
        currentBgm = style;

        const pattern = BGM_PATTERNS[style] || BGM_PATTERNS.calm;
        const { notes, scale, tempo, type, harmony } = pattern;

        let phraseIndex = 0;
        let nextTime = audioCtx.currentTime + 0.1;

        function scheduleNext() {
            if (!bgmPlaying) return;
            const melody = notes[phraseIndex % notes.length];
            nextTime = schedulePhrase(melody, nextTime, tempo, scale, type, harmony);
            phraseIndex++;
            const rest = tempo * 2 + Math.random() * tempo;
            nextTime += rest;
            const delay = Math.max(80, (nextTime - audioCtx.currentTime - 0.3) * 1000);
            bgmTimer = setTimeout(scheduleNext, delay);
        }

        scheduleNext();
    }

    function schedulePhrase(melody, startTime, tempo, scale, oscType, addHarmony) {
        let t = startTime;
        melody.forEach((noteIdx) => {
            if (noteIdx >= 0) {
                const freq = scale[noteIdx % scale.length];
                playBgmNote(freq, t, tempo, oscType, addHarmony);
            }
            t += tempo;
        });
        return t;
    }

    function playBgmNote(freq, time, duration, oscType, addHarmony) {
        if (!audioCtx || !bgmPlaying) return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = oscType;
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(bgmVolume * 0.06, time + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.03);

        osc.connect(gain);
        gain.connect(bgmGain);
        osc.start(time);
        osc.stop(time + duration);

        if (addHarmony && Math.random() > 0.5) {
            const harm = audioCtx.createOscillator();
            const harmGain = audioCtx.createGain();
            harm.type = 'sine';
            harm.frequency.value = freq * 1.5;
            harmGain.gain.setValueAtTime(0, time + 0.05);
            harmGain.gain.linearRampToValueAtTime(bgmVolume * 0.025, time + 0.12);
            harmGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.6);
            harm.connect(harmGain);
            harmGain.connect(bgmGain);
            harm.start(time + 0.05);
            harm.stop(time + duration * 0.7);
        }
    }

    function stopBgm() {
        bgmPlaying = false;
        if (bgmTimer) {
            clearTimeout(bgmTimer);
            bgmTimer = null;
        }
    }

    // ============ 音量控制 ============

    function setBgmVolume(vol) {
        bgmVolume = Math.max(0, Math.min(1, vol));
        if (bgmGain) bgmGain.gain.value = bgmVolume;
    }

    function setSfxVolume(vol) {
        sfxVolume = Math.max(0, Math.min(1, vol));
        if (sfxGain) sfxGain.gain.value = sfxVolume;
    }

    function setMuted(muted) {
        isMuted = muted;
        if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    }

    function setSfxEnabled(enabled) {
        sfxEnabled = enabled;
    }

    function getBgmVolume() { return bgmVolume; }
    function getSfxVolume() { return sfxVolume; }

    function setupUserInteraction() {
        const events = ['click', 'touchstart', 'keydown'];
        const handler = () => {
            init();
            resume();
            events.forEach(e => document.removeEventListener(e, handler));
        };
        events.forEach(e => document.addEventListener(e, handler, { once: true }));
    }

    return {
        init, resume, setupUserInteraction,
        SFX,
        startBgm, stopBgm,
        setBgmVolume, setSfxVolume, setMuted, setSfxEnabled,
        getBgmVolume, getSfxVolume,
        get isPlaying() { return bgmPlaying; },
        get isSfxEnabled() { return sfxEnabled; }
    };
})();
