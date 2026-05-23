/**
 * 万能麻将 - 统计数据系统
 */

const Stats = (function() {
    'use strict';

    const DEFAULT_STATS = {
        level: 1,
        exp: 0,
        maxExp: 100,
        totalGames: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        currentStreak: 0,
        maxStreak: 0,
        totalScore: 0,
        bestGame: 0,
        mostBombs: 0,
        totalGang: 0,
        totalHu: 0,
        totalZiMo: 0,
        achievements: [],
        unlockedAchievements: [],
        history: []
    };

    function getStats() {
        return Storage.get('stats', Utils.deepClone(DEFAULT_STATS));
    }

    function saveStats(stats) {
        Storage.set('stats', stats);
    }

    function resetStats() {
        Storage.set('stats', Utils.deepClone(DEFAULT_STATS));
        return Utils.deepClone(DEFAULT_STATS);
    }

    function addExp(amount) {
        const stats = getStats();
        stats.exp += amount;
        
        // 升级检查
        while (stats.exp >= stats.maxExp) {
            stats.exp -= stats.maxExp;
            stats.level++;
            stats.maxExp = Math.floor(100 * Math.pow(1.2, stats.level - 1));
        }
        
        saveStats(stats);
        return stats;
    }

    function recordGame(result) {
        const stats = getStats();
        stats.totalGames++;
        
        if (result.isWin) {
            stats.wins++;
            stats.currentStreak++;
            if (stats.currentStreak > stats.maxStreak) {
                stats.maxStreak = stats.currentStreak;
            }
        } else {
            stats.losses++;
            stats.currentStreak = 0;
        }
        
        stats.winRate = stats.totalGames > 0 
            ? Math.round((stats.wins / stats.totalGames) * 100) 
            : 0;
        
        stats.totalScore += result.score || 0;
        
        if (result.score > stats.bestGame) {
            stats.bestGame = result.score;
        }
        
        if (result.gangCount > stats.mostBombs) {
            stats.mostBombs = result.gangCount;
        }
        
        stats.totalGang += result.gangCount || 0;
        stats.totalHu += result.huCount || 0;
        stats.totalZiMo += result.ziMoCount || 0;
        
        // 添加历史记录
        stats.history.unshift({
            date: new Date().toISOString(),
            mahjongType: result.mahjongType,
            isWin: result.isWin,
            score: result.score,
            fan: result.fan,
            rounds: result.rounds
        });
        
        // 只保留最近50条
        if (stats.history.length > 50) {
            stats.history = stats.history.slice(0, 50);
        }
        
        // 加经验
        const expGain = result.isWin ? 20 + (result.fan || 0) * 2 : 5;
        addExp(expGain);
        
        // 检查成就
        checkAchievements(stats, result);
        
        saveStats(stats);
        return stats;
    }

    // 成就定义
    const ACHIEVEMENTS = [
        { id: 'first_win', name: '初战告捷', desc: '赢得第一局游戏', icon: '🏆', condition: s => s.wins >= 1 },
        { id: 'win_10', name: '十连胜手', desc: '累计赢得10局', icon: '🥇', condition: s => s.wins >= 10 },
        { id: 'win_100', name: '百战百胜', desc: '累计赢得100局', icon: '👑', condition: s => s.wins >= 100 },
        { id: 'streak_5', name: '五连胜', desc: '连胜5局', icon: '🔥', condition: s => s.maxStreak >= 5 },
        { id: 'streak_10', name: '十连胜', desc: '连胜10局', icon: '⚡', condition: s => s.maxStreak >= 10 },
        { id: 'gang_master', name: '杠上开花', desc: '单局杠3次以上', icon: '💣', condition: (s, r) => r.gangCount >= 3 },
        { id: 'big_win', name: '大满贯', desc: '单局得分超过1000', icon: '💰', condition: (s, r) => r.score >= 1000 },
        { id: 'zi_mo_king', name: '自摸王', desc: '单局自摸3次以上', icon: '🎯', condition: (s, r) => r.ziMoCount >= 3 },
        { id: 'veteran', name: '老手', desc: '累计进行50局', icon: '🎖️', condition: s => s.totalGames >= 50 },
        { id: 'master', name: '麻将大师', desc: '达到10级', icon: '🌟', condition: s => s.level >= 10 },
        { id: 'seven_pairs', name: '七对专家', desc: '胡出七对', icon: '🎲', condition: (s, r) => r.winType === 'seven_pairs' },
        { id: 'qing_yi_se', name: '清一色', desc: '胡出清一色', icon: '🎨', condition: (s, r) => r.hasQingYiSe },
        { id: 'thirteen_orphans', name: '国士无双', desc: '胡出十三幺', icon: '👑', condition: (s, r) => r.winType === 'thirteen_orphans' },
        { id: 'all_types', name: '全能选手', desc: '玩遍所有麻将种类', icon: '🌍', condition: (s, r) => s.playedTypes?.length >= 10 },
        { id: 'perfect', name: '完美对局', desc: '一局不输赢得比赛', icon: '💎', condition: (s, r) => r.isWin && r.rounds >= 4 && r.lossCount === 0 }
    ];

    function getAchievements() {
        const stats = getStats();
        return ACHIEVEMENTS.map(ach => ({
            ...ach,
            unlocked: stats.unlockedAchievements.includes(ach.id),
            progress: getAchievementProgress(ach, stats)
        }));
    }

    function getAchievementProgress(achievement, stats) {
        // 简单的进度估算
        switch (achievement.id) {
            case 'first_win': return Math.min(stats.wins / 1 * 100, 100);
            case 'win_10': return Math.min(stats.wins / 10 * 100, 100);
            case 'win_100': return Math.min(stats.wins / 100 * 100, 100);
            case 'streak_5': return Math.min(stats.maxStreak / 5 * 100, 100);
            case 'streak_10': return Math.min(stats.maxStreak / 10 * 100, 100);
            case 'veteran': return Math.min(stats.totalGames / 50 * 100, 100);
            case 'master': return Math.min(stats.level / 10 * 100, 100);
            default: return stats.unlockedAchievements.includes(achievement.id) ? 100 : 0;
        }
    }

    function checkAchievements(stats, result) {
        const newlyUnlocked = [];
        
        for (const ach of ACHIEVEMENTS) {
            if (!stats.unlockedAchievements.includes(ach.id)) {
                if (ach.condition(stats, result)) {
                    stats.unlockedAchievements.push(ach.id);
                    newlyUnlocked.push(ach);
                }
            }
        }
        
        return newlyUnlocked;
    }

    function getSettings() {
        return Storage.get('settings', {
            playerName: '玩家',
            aiDifficulty: 'normal',
            tableTheme: 'classic-green',
            gameRounds: 4,
            gameSpeed: 'normal',
            uiDensity: 'comfortable',
            bgmVolume: 50,
            sfxVolume: 50,
            sfxEnabled: true,
            bgmStyle: 'calm',
            animationLevel: 'normal',
            opponentDisplay: 'small',
            tableZoom: 100,
            handSize: 100,
            mahjongType: 'guangdong',
            showTileNames: false,
            autoSort: true
        });
    }

    function saveSettings(settings) {
        Storage.set('settings', settings);
    }

    return {
        getStats,
        saveStats,
        resetStats,
        addExp,
        recordGame,
        getAchievements,
        checkAchievements,
        getSettings,
        saveSettings,
        ACHIEVEMENTS
    };
})();
