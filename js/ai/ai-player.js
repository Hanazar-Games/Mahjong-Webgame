/**
 * 万能麻将 - AI玩家系统
 */

const AIPlayer = (function() {
    'use strict';

    const { canWin, analyzeTingPai, countTiles } = Rules;

    /**
     * AI选择打哪张牌
     */
    function chooseDiscard(player, difficulty = 'normal') {
        const hand = player.hand;
        const melds = player.melds;
        
        switch (difficulty) {
            case 'easy':
                return chooseDiscardEasy(hand, melds);
            case 'normal':
                return chooseDiscardNormal(hand, melds);
            case 'hard':
                return chooseDiscardHard(hand, melds);
            case 'expert':
                return chooseDiscardExpert(hand, melds, player);
            default:
                return chooseDiscardNormal(hand, melds);
        }
    }

    /**
     * 简单AI：随机打牌，但尽量不打有用的牌
     */
    function chooseDiscardEasy(hand, melds) {
        const candidates = hand.filter(tile => {
            // 不打花牌
            if (tile.isFlower) return false;
            return true;
        });
        
        if (candidates.length === 0) return hand[0];
        
        // 优先打孤张风牌和箭牌
        const honorTiles = candidates.filter(t => t.isHonor);
        if (honorTiles.length > 0) {
            return honorTiles[Math.floor(Math.random() * honorTiles.length)];
        }
        
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    /**
     * 普通AI：基本策略
     */
    function chooseDiscardNormal(hand, melds) {
        const scores = evaluateHand(hand, melds, 'normal');
        const sorted = scores.sort((a, b) => a.score - b.score);
        return sorted[0].tile;
    }

    /**
     * 困难AI：进阶策略
     */
    function chooseDiscardHard(hand, melds) {
        const scores = evaluateHand(hand, melds, 'hard');
        const sorted = scores.sort((a, b) => a.score - b.score);
        
        // 考虑听牌效率
        const bestTiles = sorted.slice(0, 3);
        let bestTile = bestTiles[0].tile;
        let bestTingCount = -1;
        
        for (const item of bestTiles) {
            const testHand = hand.filter(t => t.id !== item.tile.id);
            const tingPai = analyzeTingPai(testHand);
            const tingCount = tingPai.reduce((sum, tp) => sum + tp.remaining, 0);
            if (tingCount > bestTingCount) {
                bestTingCount = tingCount;
                bestTile = item.tile;
            }
        }
        
        return bestTile;
    }

    /**
     * 专家AI：最优策略
     */
    function chooseDiscardExpert(hand, melds, player) {
        const scores = evaluateHand(hand, melds, 'expert');
        
        // 考虑多种因素
        const weightedScores = scores.map(item => {
            let score = item.score;
            
            // 四川麻将：考虑缺门
            if (player.queYiMen) {
                if (item.tile.suit === player.queYiMen) {
                    score -= 100; // 优先打完缺门的牌
                }
            }
            
            // 考虑向听数
            const testHand = hand.filter(t => t.id !== item.tile.id);
            const tingPai = analyzeTingPai(testHand);
            const tingCount = tingPai.length;
            const totalRemaining = tingPai.reduce((sum, tp) => sum + tp.remaining, 0);
            
            score -= tingCount * 5;
            score -= totalRemaining * 0.5;
            
            // 考虑对手可能的胡牌
            // 专家AI会记住已打的牌，推断对手手牌
            
            return { ...item, score };
        });
        
        weightedScores.sort((a, b) => a.score - b.score);
        return weightedScores[0].tile;
    }

    /**
     * 评估手牌中每张牌的保留价值
     */
    function evaluateHand(hand, melds, level) {
        const counts = countTiles(hand);
        const results = [];
        
        for (const tile of hand) {
            let score = 0;
            const key = `${tile.suit}-${tile.value}`;
            const count = counts[key] || 0;
            
            // 花牌：绝对不能打
            if (tile.isFlower) {
                score = -1000;
                results.push({ tile, score });
                continue;
            }
            
            // 字牌评估
            if (tile.isHonor) {
                if (count >= 2) {
                    // 成对的风牌有价值
                    score -= count * 3;
                } else {
                    // 孤张风牌价值低
                    score += 5;
                }
                results.push({ tile, score });
                continue;
            }
            
            // 数牌评估
            const neighbors = getNeighbors(hand, tile);
            
            // 成刻子
            if (count >= 3) {
                score -= 8;
            } else if (count === 2) {
                score -= 5;
            }
            
            // 成顺子潜力
            if (neighbors.hasLeft && neighbors.hasRight) {
                score -= 7; // 两边都有，成顺子潜力大
            } else if (neighbors.hasLeft || neighbors.hasRight) {
                score -= 3; // 单边有
            }
            
            // 边张牌价值较低
            if (tile.value === 1 || tile.value === 9) {
                score += 2;
            }
            if (tile.value === 2 || tile.value === 8) {
                score += 1;
            }
            
            // 中张牌（4,5,6）价值高
            if (tile.value >= 4 && tile.value <= 6) {
                score -= 1;
            }
            
            // 专家级：考虑牌型
            if (level === 'expert') {
                // 考虑清一色倾向
                const suitCounts = {};
                for (const t of hand) {
                    if (!t.isHonor) {
                        suitCounts[t.suit] = (suitCounts[t.suit] || 0) + 1;
                    }
                }
                const maxSuitCount = Math.max(...Object.values(suitCounts));
                if (!tile.isHonor && suitCounts[tile.suit] < maxSuitCount - 3) {
                    score += 3; // 倾向于打少数花色
                }
            }
            
            results.push({ tile, score });
        }
        
        return results;
    }

    /**
     * 获取相邻牌信息
     */
    function getNeighbors(hand, tile) {
        if (tile.isHonor) return { hasLeft: false, hasRight: false };
        
        const left = hand.find(t => t.suit === tile.suit && t.value === tile.value - 1);
        const right = hand.find(t => t.suit === tile.suit && t.value === tile.value + 1);
        const left2 = hand.find(t => t.suit === tile.suit && t.value === tile.value - 2);
        const right2 = hand.find(t => t.suit === tile.suit && t.value === tile.value + 2);
        
        return {
            hasLeft: !!left,
            hasRight: !!right,
            hasLeft2: !!left2,
            hasRight2: !!right2
        };
    }

    /**
     * 判断是否暗杠
     */
    function shouldAnGang(player, options, difficulty = 'normal') {
        if (difficulty === 'easy') {
            return Math.random() < 0.3;
        }
        
        // 检查是否听牌
        const winResult = canWin(player.hand);
        if (winResult.canWin) {
            return false; // 听牌了不打杠
        }
        
        if (difficulty === 'normal') {
            return Math.random() < 0.6;
        }
        
        // 困难/专家：更精细判断
        const option = options[0];
        if (option.type === 'an_gang') {
            // 暗杠较安全
            return true;
        }
        
        // 加杠要更谨慎
        if (option.type === 'jia_gang') {
            // 检查是否有人可能抢杠
            return Math.random() < 0.7;
        }
        
        return true;
    }

    /**
     * AI选择吃碰杠
     */
    function shouldAction(player, action, tile, difficulty = 'normal') {
        if (difficulty === 'easy') {
            return Math.random() < 0.5;
        }
        
        switch (action.type) {
            case 'chi':
                return shouldChi(player, action, difficulty);
            case 'peng':
                return shouldPeng(player, action, difficulty);
            case 'gang':
                return shouldGang(player, action, difficulty);
            case 'hu':
                return true; // 能胡就胡
            default:
                return false;
        }
    }

    function shouldChi(player, action, difficulty) {
        if (difficulty === 'normal') {
            return Math.random() < 0.6;
        }
        
        // 考虑吃后手牌效率
        const testHand = [...player.hand, action.tile];
        const tingPai = analyzeTingPai(testHand);
        return tingPai.length > 0;
    }

    function shouldPeng(player, action, difficulty) {
        if (difficulty === 'normal') {
            return Math.random() < 0.7;
        }
        
        // 风牌/箭牌优先碰
        if (action.tile.isHonor) {
            return true;
        }
        
        // 考虑是否影响牌型
        const counts = countTiles(player.hand);
        const key = `${action.tile.suit}-${action.tile.value}`;
        const hasFourth = counts[key] >= 3;
        
        // 如果有第4张，可以考虑杠
        if (hasFourth) {
            return Math.random() < 0.3;
        }
        
        return true;
    }

    function shouldGang(player, action, difficulty) {
        if (difficulty === 'normal') {
            return Math.random() < 0.5;
        }
        
        // 杠收益较高
        return true;
    }

    return {
        chooseDiscard,
        shouldAnGang,
        shouldAction
    };
})();
