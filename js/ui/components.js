/**
 * 万能麻将 - UI组件（动画增强版）
 */

const UIComponents = (function() {
    'use strict';

    /**
     * 创建麻将牌DOM元素
     */
    function createTileElement(tile, options = {}) {
        const div = document.createElement('div');
        div.className = 'mahjong-tile';
        div.dataset.id = tile.id;
        div.dataset.suit = tile.suit;
        div.dataset.value = tile.value;
        
        if (options.faceDown) {
            div.classList.add('back');
        } else {
            div.textContent = tile.unicode;
            div.title = tile.name;
        }
        
        if (options.selectable) {
            div.addEventListener('click', () => {
                div.classList.toggle('selected');
            });
        }
        
        if (options.onClick) {
            div.addEventListener('click', () => options.onClick(tile));
        }
        
        if (options.small) {
            div.style.width = '28px';
            div.style.height = '38px';
            div.style.fontSize = '1rem';
        }
        
        // 添加拖拽支持
        if (options.draggable) {
            setupDrag(div, tile, options.onDragEnd);
        }
        
        return div;
    }

    /**
     * 设置拖拽
     */
    function setupDrag(element, tile, onDragEnd) {
        let isDragging = false;
        let startX, startY;
        let clone = null;
        
        element.addEventListener('mousedown', startDrag);
        element.addEventListener('touchstart', startDrag, { passive: false });
        
        function startDrag(e) {
            if (element.classList.contains('back')) return;
            e.preventDefault();
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            isDragging = false;
            startX = clientX;
            startY = clientY;
            
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        }
        
        function onMove(e) {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            const dx = clientX - startX;
            const dy = clientY - startY;
            
            if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                isDragging = true;
                element.classList.add('drag-source');
                
                clone = element.cloneNode(true);
                clone.classList.add('dragging');
                clone.style.width = element.offsetWidth + 'px';
                clone.style.height = element.offsetHeight + 'px';
                document.body.appendChild(clone);
                
                // 高亮弃牌区域
                const discardPile = document.getElementById('discard-pile');
                if (discardPile) discardPile.classList.add('discard-target');
            }
            
            if (isDragging && clone) {
                clone.style.left = (clientX - clone.offsetWidth / 2) + 'px';
                clone.style.top = (clientY - clone.offsetHeight / 2) + 'px';
            }
        }
        
        function onEnd(e) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            
            const discardPile = document.getElementById('discard-pile');
            if (discardPile) discardPile.classList.remove('discard-target');
            
            if (isDragging && clone) {
                const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
                const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
                
                const rect = discardPile?.getBoundingClientRect();
                if (rect && clientX >= rect.left && clientX <= rect.right &&
                    clientY >= rect.top && clientY <= rect.bottom) {
                    // 拖到弃牌区
                    if (onDragEnd) onDragEnd(tile);
                }
                
                clone.remove();
                element.classList.remove('drag-source');
            }
            
            isDragging = false;
            clone = null;
        }
    }

    /**
     * 创建玩家信息面板
     */
    function createPlayerInfo(player, isCurrent = false) {
        const div = document.createElement('div');
        div.className = `player-info ${isCurrent ? 'current-turn' : ''}`;
        div.innerHTML = `
            <div class="player-avatar">${player.isAI ? '🤖' : '👤'}</div>
            <div class="player-name">${player.name}</div>
            <div class="player-score">${player.score}</div>
        `;
        return div;
    }

    /**
     * 创建手牌区域
     */
    function createHandArea(tiles, options = {}) {
        const div = document.createElement('div');
        div.className = 'hand-area';
        
        for (const tile of tiles) {
            div.appendChild(createTileElement(tile, options));
        }
        
        return div;
    }

    /**
     * 创建副露区域
     */
    function createMeldsArea(melds) {
        const div = document.createElement('div');
        div.className = 'melds-area';
        
        for (const meld of melds) {
            const group = document.createElement('div');
            group.className = 'meld-group';
            
            for (const tile of meld.tiles) {
                const tileEl = createTileElement(tile, { small: true });
                group.appendChild(tileEl);
            }
            
            div.appendChild(group);
        }
        
        return div;
    }

    /**
     * 创建模态框
     */
    function createModal(title, content, buttons = []) {
        const overlay = document.createElement('div');
        overlay.className = 'modal';
        
        const modal = document.createElement('div');
        modal.className = 'modal-content neon-border';
        
        if (title) {
            const h3 = document.createElement('h3');
            h3.textContent = title;
            modal.appendChild(h3);
        }
        
        if (content) {
            const contentDiv = document.createElement('div');
            contentDiv.innerHTML = content;
            modal.appendChild(contentDiv);
        }
        
        for (const btn of buttons) {
            const button = document.createElement('button');
            button.className = 'modal-btn';
            button.textContent = btn.text;
            button.addEventListener('click', () => {
                if (btn.onClick) btn.onClick();
                overlay.remove();
            });
            modal.appendChild(button);
        }
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // 点击背景关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
        
        return overlay;
    }

    /**
     * 创建成就卡片
     */
    function createAchievementCard(achievement) {
        const div = document.createElement('div');
        div.className = `achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'}`;
        if (achievement.unlocked) div.classList.add('neon-border');
        div.innerHTML = `
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-info">
                <div class="achievement-name">${achievement.name}</div>
                <div class="achievement-desc">${achievement.desc}</div>
                <div class="achievement-progress">
                    <div class="achievement-progress-bar" style="width: ${achievement.progress}%"></div>
                </div>
            </div>
        `;
        return div;
    }

    /**
     * 创建回放项
     */
    function createReplayItem(replay, onPlay, onDelete) {
        const div = document.createElement('div');
        div.className = 'replay-item';
        
        const date = new Date(replay.date);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        
        div.innerHTML = `
            <div class="replay-info">
                <span class="replay-title">${replay.mahjongType} · ${replay.rounds}局</span>
                <span class="replay-meta">${dateStr} · ${replay.finalScores?.[0]?.name || '未知'} 胜出</span>
            </div>
            <div class="replay-actions">
                <button class="replay-btn">播放</button>
                <button class="replay-btn" style="background:#f44336">删除</button>
            </div>
        `;
        
        const buttons = div.querySelectorAll('.replay-btn');
        buttons[0].addEventListener('click', () => onPlay?.(replay));
        buttons[1].addEventListener('click', () => onDelete?.(replay));
        
        return div;
    }

    /**
     * 创建房间项
     */
    function createRoomItem(room, onJoin) {
        const div = document.createElement('div');
        div.className = 'room-item';
        div.innerHTML = `
            <div class="room-item-info">
                <span class="room-item-name">${room.name}</span>
                <span class="room-item-meta">${room.type} · ${room.players}/${room.maxPlayers}人</span>
            </div>
            <button class="room-item-join">加入</button>
        `;
        
        div.querySelector('.room-item-join').addEventListener('click', () => onJoin?.(room));
        
        return div;
    }

    /**
     * 切换屏幕
     */
    function switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) {
            target.classList.add('active');
        }
    }

    /**
     * 显示动作效果
     */
    function showActionEffect(text) {
        const div = document.createElement('div');
        div.className = 'action-effect';
        div.textContent = text;
        document.getElementById('app').appendChild(div);
        setTimeout(() => div.remove(), 1000);
    }

    /**
     * 显示连击效果
     */
    function showCombo(text) {
        const div = document.createElement('div');
        div.className = 'combo-text';
        div.textContent = text;
        document.getElementById('app').appendChild(div);
        setTimeout(() => div.remove(), 1000);
    }

    /**
     * 全屏胡牌特效
     */
    function showWinEffect(isZiMo = false) {
        const app = document.getElementById('app');
        
        // 创建覆盖层
        const overlay = document.createElement('div');
        overlay.className = 'win-overlay';
        
        // 闪光效果
        const flash = document.createElement('div');
        flash.className = 'win-flash';
        overlay.appendChild(flash);
        
        // 扩散环
        const rings = document.createElement('div');
        rings.className = 'win-rings';
        for (let i = 0; i < 3; i++) {
            const ring = document.createElement('div');
            ring.className = 'win-ring';
            rings.appendChild(ring);
        }
        overlay.appendChild(rings);
        
        app.appendChild(overlay);
        
        // 彩虹光效
        if (isZiMo) {
            const rainbow = document.getElementById('rainbow-overlay');
            if (rainbow) {
                rainbow.classList.add('active');
                setTimeout(() => rainbow.classList.remove('active'), 3000);
            }
        }
        
        setTimeout(() => overlay.remove(), 2000);
    }

    /**
     * 分数浮动效果
     */
    function showScoreFloat(element, delta, x, y) {
        const float = document.createElement('div');
        float.className = `score-float ${delta >= 0 ? 'positive' : 'negative'}`;
        float.textContent = delta >= 0 ? `+${delta}` : `${delta}`;
        float.style.left = (x || window.innerWidth / 2) + 'px';
        float.style.top = (y || window.innerHeight / 2) + 'px';
        document.getElementById('app').appendChild(float);
        setTimeout(() => float.remove(), 1200);
    }

    /**
     * 分数跳动
     */
    function animateScore(element) {
        if (!element) return;
        element.classList.remove('score-pop');
        void element.offsetWidth; // 强制重绘
        element.classList.add('score-pop');
    }

    /**
     * 更新统计面板
     */
    function updateStatsPanel(stats) {
        const els = {
            'player-level': stats.level,
            'current-exp': stats.exp,
            'max-exp': stats.maxExp,
            'stat-total-games': stats.totalGames,
            'stat-wins': stats.wins,
            'stat-losses': stats.losses,
            'stat-winrate': stats.winRate + '%',
            'stat-streak': `${stats.currentStreak}/${stats.maxStreak}`,
            'stat-total-score': stats.totalScore,
            'stat-best-game': stats.bestGame,
            'stat-most-bombs': stats.mostBombs
        };
        
        for (const [id, value] of Object.entries(els)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }
        
        // 经验条
        const expFill = document.getElementById('exp-fill');
        if (expFill) {
            const percent = (stats.exp / stats.maxExp) * 100;
            expFill.style.width = percent + '%';
        }
    }

    /**
     * 创建粒子爆炸效果
     */
    function createParticles(x, y, options = {}) {
        const {
            count = 16,
            color = 'var(--accent-gold)',
            size = 10,
            spread = 120,
            duration = 1000,
            type = 'circle'
        } = options;

        const container = document.getElementById('particle-container') || document.body;
        
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            if (type === 'star') particle.classList.add('particle-star');
            else if (color.includes('gold') || color === 'var(--accent-gold)') particle.classList.add('particle-gold');
            
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';
            particle.style.width = (size * (0.5 + Math.random())) + 'px';
            particle.style.height = particle.style.width;
            particle.style.background = color;
            
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
            const distance = spread * (0.3 + Math.random() * 0.7);
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance;
            
            particle.style.animation = `particleBurst ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
            particle.style.animationDelay = `${Math.random() * 150}ms`;
            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);
            
            container.appendChild(particle);
            setTimeout(() => particle.remove(), duration + 300);
        }
    }

    /**
     * 创建彩带效果
     */
    function createConfetti(options = {}) {
        const { count = 50, duration = 4000 } = options;
        const colors = ['#d4a843', '#e8c870', '#4caf50', '#f44336', '#2196f3', '#ff9800', '#9c27b0', '#00bcd4'];
        const container = document.getElementById('particle-container') || document.body;
        
        for (let i = 0; i < count; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = Math.random() * 100 + 'vw';
            piece.style.top = '-15px';
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.width = (5 + Math.random() * 10) + 'px';
            piece.style.height = (5 + Math.random() * 10) + 'px';
            piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
            piece.style.animationDuration = (duration * 0.4 + Math.random() * duration * 0.6) + 'ms';
            piece.style.animationDelay = (Math.random() * 800) + 'ms';
            
            // 随机旋转方向
            const rotationDir = Math.random() > 0.5 ? 1 : -1;
            piece.style.setProperty('--rot-dir', rotationDir);
            
            container.appendChild(piece);
            setTimeout(() => piece.remove(), duration + 1500);
        }
    }

    /**
     * 屏幕震动效果
     */
    function screenShake(intensity = 5, duration = 300) {
        const app = document.getElementById('app');
        if (!app) return;
        
        const startTime = Date.now();
        function shake() {
            const elapsed = Date.now() - startTime;
            if (elapsed >= duration) {
                app.style.transform = '';
                return;
            }
            const decay = 1 - elapsed / duration;
            const dx = (Math.random() - 0.5) * intensity * decay * 2;
            const dy = (Math.random() - 0.5) * intensity * decay * 2;
            const rot = (Math.random() - 0.5) * intensity * decay * 0.5;
            app.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
            requestAnimationFrame(shake);
        }
        shake();
    }

    /**
     * 成就解锁闪光
     */
    function flashAchievement(element) {
        if (!element) return;
        element.classList.add('achievement-unlock');
        setTimeout(() => element.classList.remove('achievement-unlock'), 800);
    }

    return {
        createTileElement,
        createPlayerInfo,
        createHandArea,
        createMeldsArea,
        createModal,
        createAchievementCard,
        createReplayItem,
        createRoomItem,
        switchScreen,
        showActionEffect,
        showCombo,
        showWinEffect,
        showScoreFloat,
        animateScore,
        updateStatsPanel,
        createParticles,
        createConfetti,
        screenShake,
        flashAchievement
    };
})();
