/**
 * 万能麻将 - 设置、主题与游戏内菜单模块
 * 从 main.js 拆分（架构拆分轮次 2）
 */
    function showSettingsModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.remove('hidden');
    }

    function hideSettingsModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.add('hidden');
        // 保存设置
        saveAllSettings();
    }

    /**
     * 保存所有设置
     */
    function saveAllSettings() {
        const fields = {
            'player-name': 'playerName',
            'ai-difficulty': 'aiDifficulty',
            'table-theme': 'tableTheme',
            'game-rounds': 'gameRounds',
            'game-speed': 'gameSpeed',

            'opponent-display': 'opponentDisplay',
            'sfx-enabled': 'sfxEnabled',
            'bgm-style': 'bgmStyle',
            'show-tile-names': 'showTileNames',
            'auto-sort': 'autoSort',
            'bgm-volume': 'bgmVolume',
            'sfx-volume': 'sfxVolume'
        };
        for (const [id, key] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (!el) continue;
            let value = el.value;
            if (el.type === 'checkbox') value = el.checked;
            else if (el.type === 'range') value = parseInt(value);
            else if (value === 'true' || value === 'false') value = value === 'true';
            App.settings[key] = value;
        }
        Stats.saveSettings(App.settings);
    }

    /**
     * 显示/隐藏游戏内菜单
     */
    let _wasTimerRunning = false;

    function showIngameMenu() {
        const menu = document.getElementById('ingame-menu');
        if (menu) menu.classList.remove('hidden');
        // 暂停回合计时器，防止玩家在菜单打开时被自动出牌
        _wasTimerRunning = !!(App.engine?.timer);
        App.engine?.stopTimer();
    }

    function hideIngameMenu() {
        const menu = document.getElementById('ingame-menu');
        if (menu) menu.classList.add('hidden');
        // 恢复回合计时器（仅当暂停前计时器在运行、且仍是玩家回合时）
        if (_wasTimerRunning && App.engine && App.engine.state === 'playing') {
            const player = App.engine.players[App.engine.currentPlayerIndex];
            if (player && !player.isAI) {
                App.engine.startTimer();
            }
        }
        _wasTimerRunning = false;
    }

    /**
     * 渲染麻将种类选择
     */
    function renderMahjongTypes() {
        const container = document.getElementById('mahjong-types');
        if (!container) return;
        
        container.innerHTML = '';
        const types = Tiles.getMahjongTypes();
        
        for (const type of types) {
            const card = document.createElement('div');
            card.className = 'mahjong-type-card';
            card.dataset.type = type.key;
            card.innerHTML = `
                <div class="type-icon">${Utils.escapeHtml(type.icon)}</div>
                <div class="type-name">${Utils.escapeHtml(type.name)}</div>
                <div class="type-desc">${Utils.escapeHtml(type.desc)}</div>
            `;
            
            card.addEventListener('click', () => {
                AudioManager.SFX.buttonClick();
                container.querySelectorAll('.mahjong-type-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                renderRuleOptions(type.key);
            });
            
            container.appendChild(card);
        }
    }

    /**
     * 渲染规则选项
     */
    function renderRuleOptions(mahjongType) {
        const container = document.getElementById('rule-options');
        if (!container) return;
        
        const config = Tiles.getConfig(mahjongType);
        if (!config || !config.rules) {
            container.innerHTML = '';
            return;
        }
        
        const rules = config.rules;
        const ruleLabels = {
            allowChi: '允许吃牌',
            allowPeng: '允许碰牌',
            allowGang: '允许杠牌',
            allowAnGang: '允许暗杠',
            huaPai: '花牌计番',
            gangShangKaiHua: '杠上开花',
            qiangGang: '抢杠',
            haiDiLaoYue: '海底捞月',
            queYiMen: '缺一门',
            xueZhanDaoDi: '血战到底',
            ziMoJiaFan: '自摸加番',
            hunPai: '混儿牌',
            menQing: '门清',
            baoPai: '宝牌',
            maPai: '马牌',
            taiJi: '连庄',
            caiShen: '财神牌',
            zhaNiao: '扎鸟',
            jiangJiangHu: '将将胡',
            qiDui: '七对',
            huiEr: '带会儿',
            piaoHu: '飘胡',
            daPiao: '大飘',
            kaiKouFan: '开口翻',
            piHu: '屁胡',
            jinPai: '金牌',
            qiangJin: '抢金',
            jingPai: '精牌',
            chongGuan: '冲关',
            hongZhongLaiZi: '红中赖子'
        };
        
        container.innerHTML = '';
        
        for (const [key, value] of Object.entries(rules)) {
            if (typeof value !== 'boolean') continue;
            
            const label = ruleLabels[key] || key;
            const div = document.createElement('div');
            div.className = 'rule-option';
            div.innerHTML = `
                <label>${label}</label>
                <span style="color:${value ? 'var(--win-color)' : 'var(--text-muted)'}">${value ? '✓ 开启' : '✗ 关闭'}</span>
            `;
            container.appendChild(div);
        }
    }

    /**
     * 渲染成就
     */


    /**
     * 处理设置变更
     */
    function handleSettingChange(e) {
        const el = e.target;
        const key = el.id;
        let value = el.value;
        
        if (el.type === 'range') {
            value = parseInt(value);
        }
        
        if (el.type === 'number') {
            const n = parseInt(value);
            value = isNaN(n) ? 0 : n;
        }
        
        // 映射到settings对象
        const keyMap = {
            'player-name': 'playerName',
            'ai-difficulty': 'aiDifficulty',
            'table-theme': 'tableTheme',
            'game-rounds': 'gameRounds',
            'game-speed': 'gameSpeed',
            'bgm-volume': 'bgmVolume',
            'sfx-volume': 'sfxVolume',
            'sfx-enabled': 'sfxEnabled',
            'bgm-style': 'bgmStyle',

            'opponent-display': 'opponentDisplay',
            'show-tile-names': 'showTileNames',
            'auto-sort': 'autoSort'
        };
        
        const settingKey = keyMap[key];
        if (settingKey) {
            App.settings[settingKey] = value;
            Stats.saveSettings(App.settings);
            
            // 实时应用某些设置
            if (key === 'table-theme') {
                applyTheme(value);
            }
            if (key === 'sfx-enabled') {
                const enabled = el.type === 'checkbox' ? el.checked : (value === 'true' || value === true);
                App.settings[settingKey] = enabled; // 存储为布尔值
                AudioManager.setSfxEnabled(enabled);
                if (enabled) AudioManager.SFX.toggleSwitch();
            }
            if (key === 'bgm-style') {
                AudioManager.SFX.toggleSwitch();
                if (AudioManager.isPlaying) {
                    AudioManager.startBgm(value);
                }
            }

            if (key === 'auto-sort') {
                const enabled = value === 'true' || value === true;
                App.settings[settingKey] = enabled;
                if (App.engine?.players) {
                    App.engine.players.forEach(p => { p.autoSort = enabled; });
                }
            }
            if (key === 'show-tile-names') {
                const enabled = value === 'true' || value === true;
                App.settings[settingKey] = enabled;
                // 如果正在游戏中，重新渲染自己的手牌
                if (App.engine && App.currentScreen === 'game-screen') {
                    renderPlayerHand(0, App.engine.players[0]?.hand?.length || 0);
                }
            }
        }
    }

    /**
     * 处理滑块输入
     */
    // 滑块保存防抖（避免每帧写入localStorage）
    let _sliderSaveTimer = null;
    
    function handleSliderInput(e) {
        const el = e.target;
        const label = document.getElementById(el.id + '-value');
        if (label) {
            label.textContent = el.value + '%';
        }
        
        // 更新内存中的设置，但延迟保存到localStorage
        const keyMap = {
            'bgm-volume': 'bgmVolume',
            'sfx-volume': 'sfxVolume'
        };
        const settingKey = keyMap[el.id];
        if (settingKey) {
            App.settings[settingKey] = parseInt(el.value);
        }
        
        // 同步音频系统（即时）
        if (el.id === 'bgm-volume') {
            AudioManager.setBgmVolume(parseInt(el.value) / 100);
        }
        if (el.id === 'sfx-volume') {
            AudioManager.setSfxVolume(parseInt(el.value) / 100);
        }
        
        // 防抖保存到localStorage
        if (_sliderSaveTimer) clearTimeout(_sliderSaveTimer);
        _sliderSaveTimer = setTimeout(() => {
            _sliderSaveTimer = null;
            try {
                Stats.saveSettings(App.settings);
            } catch (e) {
                console.error('保存设置失败:', e);
                Utils.toast('设置保存失败');
            }
        }, 300);
    }

    /**
     * 应用动画级别
     */
    /**
     * 应用主题
     */
    function applyTheme(theme) {
        const root = document.documentElement;
        
        const themes = {
            'classic-green': {
                '--bg-primary': '#1a3a1a',
                '--bg-secondary': '#2d5a2d',
                '--bg-card': '#3d6b3d',
                '--bg-panel': 'rgba(30, 60, 30, 0.92)',
                '--accent-gold': '#d4a843',
                '--accent-gold-light': '#e8c870',
                '--accent-gold-dark': '#b8922e',
                '--text-primary': '#f0e6d2',
                '--text-secondary': '#c4b896',
                '--text-muted': '#8a9a7a',
                '--win-color': '#4caf50',
                '--lose-color': '#f44336',
                '--hud-bg': 'rgba(18, 18, 24, 0.92)',
                '--hud-border': 'rgba(212, 168, 67, 0.12)',
                '--hud-gold-glow': '0 0 20px rgba(212, 168, 67, 0.15)',
                '--turn-glow': '0 0 16px rgba(212, 168, 67, 0.5)',
                '--shadow-glow': '0 0 20px rgba(212, 168, 67, 0.2)'
            },
            'dark-blue': {
                '--bg-primary': '#1a1a3a',
                '--bg-secondary': '#2d2d5a',
                '--bg-card': '#3d3d6b',
                '--bg-panel': 'rgba(25, 25, 55, 0.92)',
                '--accent-gold': '#6b9ed4',
                '--accent-gold-light': '#8ab8e8',
                '--accent-gold-dark': '#4a7db0',
                '--text-primary': '#e0e8f0',
                '--text-secondary': '#a8b8d0',
                '--text-muted': '#7a8aaa',
                '--win-color': '#4caf50',
                '--lose-color': '#f44336',
                '--hud-bg': 'rgba(15, 15, 30, 0.92)',
                '--hud-border': 'rgba(107, 158, 212, 0.12)',
                '--hud-gold-glow': '0 0 20px rgba(107, 158, 212, 0.15)',
                '--turn-glow': '0 0 16px rgba(107, 158, 212, 0.5)',
                '--shadow-glow': '0 0 20px rgba(107, 158, 212, 0.2)'
            },
            'wood': {
                '--bg-primary': '#3a2a1a',
                '--bg-secondary': '#5a4a2d',
                '--bg-card': '#6b5a3d',
                '--bg-panel': 'rgba(50, 40, 25, 0.92)',
                '--accent-gold': '#c4a86b',
                '--accent-gold-light': '#d8c090',
                '--accent-gold-dark': '#a08850',
                '--text-primary': '#f0e6d2',
                '--text-secondary': '#c8b898',
                '--text-muted': '#9a8a6a',
                '--win-color': '#4caf50',
                '--lose-color': '#f44336',
                '--hud-bg': 'rgba(25, 20, 15, 0.92)',
                '--hud-border': 'rgba(196, 168, 107, 0.12)',
                '--hud-gold-glow': '0 0 20px rgba(196, 168, 107, 0.15)',
                '--turn-glow': '0 0 16px rgba(196, 168, 107, 0.5)',
                '--shadow-glow': '0 0 20px rgba(196, 168, 107, 0.2)'
            },
            'red': {
                '--bg-primary': '#3a1a1a',
                '--bg-secondary': '#5a2d2d',
                '--bg-card': '#6b3d3d',
                '--bg-panel': 'rgba(55, 25, 25, 0.92)',
                '--accent-gold': '#d46b6b',
                '--accent-gold-light': '#e89090',
                '--accent-gold-dark': '#b05050',
                '--text-primary': '#f0e0e0',
                '--text-secondary': '#d0a8a8',
                '--text-muted': '#a07878',
                '--win-color': '#4caf50',
                '--lose-color': '#f44336',
                '--hud-bg': 'rgba(25, 15, 15, 0.92)',
                '--hud-border': 'rgba(212, 107, 107, 0.12)',
                '--hud-gold-glow': '0 0 20px rgba(212, 107, 107, 0.15)',
                '--turn-glow': '0 0 16px rgba(212, 107, 107, 0.5)',
                '--shadow-glow': '0 0 20px rgba(212, 107, 107, 0.2)'
            }
        };
        
        const t = themes[theme] || themes['classic-green'];
        for (const [key, value] of Object.entries(t)) {
            root.style.setProperty(key, value);
        }
    }

    /**
     * 重置统计
     */
