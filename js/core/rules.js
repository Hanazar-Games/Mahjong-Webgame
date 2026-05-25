/**
 * 万能麻将 - 规则系统
 * 胡牌判断、番数计算、特殊规则
 */

const Rules = (function() {
    'use strict';

    const { SUIT_TYPES, createTile, isSameTile, canFormSequence, canFormTriplet, sortTiles } = Tiles;

    /**
     * 判断一手牌是否可以胡牌
     * 使用递归分解法
     */
    function canWin(hand, config = {}) {
        if (hand.length % 3 !== 1 && hand.length % 3 !== 2) return false;
        
        const sorted = sortTiles(hand);
        
        // 七对（支持任意偶数张牌，如台湾麻将16张=8对）
        if (hand.length % 2 === 0 && hand.length >= 14 && isSevenPairs(sorted)) {
            return { canWin: true, type: 'seven_pairs' };
        }
        
        // 十三幺
        if (hand.length === 14 && isThirteenOrphans(sorted)) {
            return { canWin: true, type: 'thirteen_orphans' };
        }
        
        // 标准胡牌型
        const result = findStandardWin(sorted);
        if (result) {
            return { canWin: true, type: 'standard', ...result };
        }
        
        return { canWin: false };
    }

    /**
     * 标准胡牌判断
     */
    function findStandardWin(tiles) {
        if (tiles.length === 0) return { pair: [], melds: [] };
        if (tiles.length % 3 !== 2) return null;
        // 标准胡牌至少需要5张（1对+1个面子）
        if (tiles.length < 5) return null;

        // 尝试每种牌作为将牌
        for (let i = 0; i < tiles.length - 1; i++) {
            if (i > 0 && isSameTile(tiles[i], tiles[i - 1])) continue;
            
            if (isSameTile(tiles[i], tiles[i + 1])) {
                const pair = [tiles[i], tiles[i + 1]];
                const remaining = [...tiles.slice(0, i), ...tiles.slice(i + 2)];
                
                const melds = findAllMelds(remaining);
                if (melds !== null) {
                    return { pair, melds };
                }
            }
        }
        return null;
    }

    /**
     * 从剩余牌中找出所有面子
     */
    function findAllMelds(tiles) {
        if (tiles.length === 0) return [];
        if (tiles.length % 3 !== 0) return null;

        const sorted = sortTiles(tiles);
        const result = tryFormMelds(sorted, []);
        return result;
    }

    function tryFormMelds(remaining, melds) {
        if (remaining.length === 0) return melds;

        const first = remaining[0];
        
        // 尝试刻子
        const tripletIndices = findTriplet(remaining, first);
        if (tripletIndices) {
            const newRemaining = removeIndices(remaining, tripletIndices);
            const result = tryFormMelds(newRemaining, [...melds, {
                type: 'triplet',
                tiles: tripletIndices.map(i => remaining[i])
            }]);
            if (result !== null) return result;
        }
        
        // 尝试顺子
        const sequenceIndices = findSequence(remaining, first);
        if (sequenceIndices) {
            const newRemaining = removeIndices(remaining, sequenceIndices);
            const result = tryFormMelds(newRemaining, [...melds, {
                type: 'sequence',
                tiles: sequenceIndices.map(i => remaining[i])
            }]);
            if (result !== null) return result;
        }
        
        return null;
    }

    function findTriplet(tiles, target) {
        const indices = [];
        for (let i = 0; i < tiles.length && indices.length < 3; i++) {
            if (isSameTile(tiles[i], target)) {
                indices.push(i);
            }
        }
        return indices.length === 3 ? indices : null;
    }

    function findSequence(tiles, target) {
        if (target.isHonor || target.isFlower) return null;
        
        // 找到 target 的索引（第一张）
        const idx0 = tiles.findIndex(t => isSameTile(t, target));
        if (idx0 === -1) return null;
        
        // 找到 value+1 的索引（跳过已使用的牌）
        let next1 = -1;
        for (let i = 0; i < tiles.length; i++) {
            if (i === idx0) continue;
            if (tiles[i].suit === target.suit && tiles[i].value === target.value + 1) {
                next1 = i;
                break;
            }
        }
        if (next1 === -1) return null;
        
        // 找到 value+2 的索引（跳过已使用的牌）
        let next2 = -1;
        for (let i = 0; i < tiles.length; i++) {
            if (i === idx0 || i === next1) continue;
            if (tiles[i].suit === target.suit && tiles[i].value === target.value + 2) {
                next2 = i;
                break;
            }
        }
        if (next2 === -1) return null;
        
        return [idx0, next1, next2];
    }

    function removeIndices(arr, indices) {
        const sorted = [...indices].sort((a, b) => b - a);
        const result = [...arr];
        for (const idx of sorted) {
            result.splice(idx, 1);
        }
        return result;
    }

    /**
     * 判断是否为七对
     * 支持四张相同牌作为两对
     */
    function isSevenPairs(tiles) {
        if (tiles.length % 2 !== 0) return false;
        const counts = countTiles(tiles);
        let pairCount = 0;
        for (const key in counts) {
            if (counts[key] % 2 !== 0) return false; // 每种牌数量必须是偶数
            pairCount += counts[key] / 2;
        }
        return pairCount === tiles.length / 2;
    }

    /**
     * 判断是否为十三幺
     */
    function isThirteenOrphans(tiles) {
        if (tiles.length !== 14) return false;
        const required = [
            ...[1, 9].map(v => createTile('wan', v)),
            ...[1, 9].map(v => createTile('tong', v)),
            ...[1, 9].map(v => createTile('tiao', v)),
            ...[1, 2, 3, 4].map(v => createTile('feng', v)),
            ...[1, 2, 3].map(v => createTile('jian', v))
        ];
        
        const counts = countTiles(tiles);
        let hasDuplicate = false;
        
        for (const req of required) {
            const key = tileKey(req);
            const count = counts[key] || 0;
            if (count < 1) return false;
            if (count > 1) {
                if (hasDuplicate || count > 2) return false;
                hasDuplicate = true;
            }
        }
        
        return hasDuplicate;
    }

    /**
     * 统计手牌中每种牌的数量
     */
    function countTiles(tiles) {
        const counts = {};
        for (const tile of tiles) {
            const key = tileKey(tile);
            counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
    }

    function tileKey(tile) {
        return `${tile.suit}-${tile.value}`;
    }

    /**
     * 判断是否可以吃
     */
    function canChi(hand, discard, config = {}) {
        if (config.allowChi === false) return [];
        if (discard.isHonor || discard.isFlower) return [];
        
        const results = [];
        const suit = discard.suit;
        const val = discard.value;
        
        // 吃上家：x, x+1, x+2 或 x-1, x, x+1 或 x-2, x-1, x
        const patterns = [
            [val - 2, val - 1],
            [val - 1, val + 1],
            [val + 1, val + 2]
        ];
        
        for (const [a, b] of patterns) {
            if (a < 1 || b > 9) continue;
            const tileA = hand.find(t => t.suit === suit && t.value === a);
            const tileB = hand.find(t => t.suit === suit && t.value === b);
            if (tileA && tileB) {
                results.push([tileA, tileB, discard]);
            }
        }
        
        return results;
    }

    /**
     * 判断是否可以碰
     */
    function canPeng(hand, discard, config = {}) {
        if (config.allowPeng === false) return false;
        const sameTiles = hand.filter(t => isSameTile(t, discard));
        return sameTiles.length >= 2;
    }

    /**
     * 判断是否可以明杠
     */
    function canGang(hand, discard, config = {}) {
        if (config.allowGang === false) return false;
        const sameTiles = hand.filter(t => isSameTile(t, discard));
        return sameTiles.length >= 3;
    }

    /**
     * 判断是否可以暗杠/加杠
     */
    function canAnGang(hand, melds, config = {}) {
        if (config.allowAnGang === false) return [];
        const results = [];
        const counts = countTiles(hand);
        const anGangKeys = new Set();
        
        // 暗杠：手中有4张相同牌
        for (const key in counts) {
            if (counts[key] === 4) {
                const tile = hand.find(t => tileKey(t) === key);
                results.push({ type: 'an_gang', tiles: hand.filter(t => tileKey(t) === key) });
                anGangKeys.add(key);
            }
        }
        
        // 加杠：已碰过，手中有第4张（排除已有暗杠的）
        for (const meld of melds) {
            if (meld.type === 'triplet') {
                const key = tileKey(meld.tiles[0]);
                if (anGangKeys.has(key)) continue;
                const fourth = hand.find(t => isSameTile(t, meld.tiles[0]));
                if (fourth) {
                    results.push({ type: 'jia_gang', meld, tile: fourth });
                }
            }
        }
        
        return results;
    }

    /**
     * 计算番数
     * @param {Array} hand - 手牌（含将牌和面子）
     * @param {Array} melds - 副露（吃碰杠）
     * @param {Object} winInfo - 胡牌信息
     * @param {Object} config - 配置
     * @param {Object} context - 上下文
     */
    function calculateFan(hand, melds, winInfo, config = {}, context = {}) {
        let fan = 0;
        const fans = [];
        
        // 基础番数
        if (winInfo.type === 'seven_pairs') {
            fan += 2;
            fans.push({ name: '七对', fan: 2 });
        }
        
        if (winInfo.type === 'thirteen_orphans') {
            fan += 13;
            fans.push({ name: '十三幺', fan: 13 });
            return { total: fan, fans };
        }
        
        // 门清
        if (context.isMenQing) {
            fan += 1;
            fans.push({ name: '门清', fan: 1 });
        }
        
        // 自摸
        if (context.isZiMo) {
            fan += 1;
            fans.push({ name: '自摸', fan: 1 });
        }
        
        // 杠上开花
        if (context.isGangShangKaiHua) {
            fan += 1;
            fans.push({ name: '杠上开花', fan: 1 });
        }
        
        // 海底捞月
        if (context.isHaiDiLaoYue) {
            fan += 1;
            fans.push({ name: '海底捞月', fan: 1 });
        }
        
        // 清一色（考虑手牌+副露）
        if (isQingYiSe(hand, melds)) {
            fan += 6;
            fans.push({ name: '清一色', fan: 6 });
        }
        // 混一色（考虑手牌+副露）
        else if (isHunYiSe(hand, melds)) {
            fan += 3;
            fans.push({ name: '混一色', fan: 3 });
        }
        
        // 碰碰胡（考虑手牌+副露）
        if (isPengPengHu(winInfo, melds)) {
            fan += 3;
            fans.push({ name: '碰碰胡', fan: 3 });
        }
        
        // 全求人
        if (context.isQuanQiuRen) {
            fan += 3;
            fans.push({ name: '全求人', fan: 3 });
        }
        
        // 平和（不能有碰杠副露）
        if (isPingHu(winInfo, melds)) {
            fan += 1;
            fans.push({ name: '平和', fan: 1 });
        }
        
        // 断幺（考虑手牌+副露）
        if (isDuanYao(hand, melds)) {
            fan += 1;
            fans.push({ name: '断幺', fan: 1 });
        }
        
        // 幺九（考虑手牌+副露）
        if (isYaoJiu(hand, melds)) {
            fan += 1;
            fans.push({ name: '幺九', fan: 1 });
        }
        
        // 杠
        if (context.gangCount) {
            fan += context.gangCount;
            fans.push({ name: `×${context.gangCount}杠`, fan: context.gangCount });
        }
        
        return { total: fan, fans };
    }

    /**
     * 获取所有参与牌型计算的牌（手牌+副露）
     */
    function getAllTiles(hand, melds) {
        const all = [...hand];
        if (melds) {
            for (const meld of melds) {
                all.push(...meld.tiles);
            }
        }
        return all;
    }

    function isQingYiSe(hand, melds) {
        const all = getAllTiles(hand, melds);
        if (all.length === 0) return false;
        const suits = new Set(all.map(t => t.suit));
        return suits.size === 1 && !all[0].isHonor;
    }

    function isHunYiSe(hand, melds) {
        const all = getAllTiles(hand, melds);
        const suits = new Set(all.map(t => t.suit));
        const hasHonor = all.some(t => t.isHonor);
        const hasNonHonor = all.some(t => !t.isHonor);
        // 混一色 = 一种数牌花色 + 字牌，不能全是字牌（那是字一色）
        return suits.size === 2 && hasHonor && hasNonHonor;
    }

    function isPengPengHu(winInfo, melds) {
        if (winInfo.type !== 'standard') return false;
        // 手牌中的面子必须都是刻子
        if (!winInfo.melds.every(m => m.type === 'triplet')) return false;
        // 副露中也必须都是刻子/杠（不能有顺子）
        if (melds && melds.some(m => m.type === 'sequence')) return false;
        return true;
    }

    function isPingHu(winInfo, melds) {
        if (winInfo.type !== 'standard') return false;
        // 平和不能有碰杠副露
        if (melds && melds.length > 0) return false;
        // 将牌不能是箭牌或幺九牌
        const pairTile = winInfo.pair[0];
        if (pairTile.isHonor || pairTile.isTerminal) return false;
        // 所有面子都是顺子
        return winInfo.melds.every(m => m.type === 'sequence');
    }

    function isDuanYao(hand, melds) {
        const all = getAllTiles(hand, melds);
        return all.every(t => t.isSimple);
    }

    function isYaoJiu(hand, melds) {
        const all = getAllTiles(hand, melds);
        return all.every(t => t.isTerminal || t.isHonor);
    }

    /**
     * 听牌分析
     */
    function analyzeTingPai(hand, config = {}) {
        const result = [];
        const allPossible = generateAllPossibleTiles(config);
        
        for (const tile of allPossible) {
            const testHand = [...hand, tile];
            const winResult = canWin(testHand, config);
            if (winResult.canWin) {
                // 统计该牌剩余数量
                const remaining = countRemaining(tile, hand);
                result.push({ tile, remaining, winType: winResult.type });
            }
        }
        
        return result;
    }

    function generateAllPossibleTiles(config) {
        const tiles = [];
        const suits = ['wan', 'tong', 'tiao', 'feng', 'jian'];
        const maxValues = { wan: 9, tong: 9, tiao: 9, feng: 4, jian: 3 };
        
        for (const suit of suits) {
            for (let v = 1; v <= maxValues[suit]; v++) {
                tiles.push(createTile(suit, v));
            }
        }
        return tiles;
    }

    function countRemaining(tile, hand) {
        const inHand = hand.filter(t => isSameTile(t, tile)).length;
        // 花牌只有1张，其他牌通常4张
        const total = tile.isFlower ? 1 : 4;
        return Math.max(0, total - inHand);
    }

    /**
     * 四川麻将：判断缺门
     */
    function checkQueYiMen(hand, chosenSuit = null) {
        const suits = new Set();
        for (const tile of hand) {
            if (!tile.isHonor && !tile.isFlower) {
                suits.add(tile.suit);
            }
        }
        // 如果指定了缺门花色，必须确认该花色确实不存在
        if (chosenSuit && suits.has(chosenSuit)) {
            return false;
        }
        return suits.size <= 2;
    }

    /**
     * 判断是否为烂牌（无法胡牌）
     */
    function isDeadHand(hand, config = {}) {
        const tingPai = analyzeTingPai(hand, config);
        return tingPai.length === 0;
    }

    return {
        canWin,
        canChi,
        canPeng,
        canGang,
        canAnGang,
        calculateFan,
        analyzeTingPai,
        checkQueYiMen,
        isDeadHand,
        isSevenPairs: tiles => tiles.length % 2 === 0 && tiles.length >= 14 && isSevenPairs(tiles),
        isThirteenOrphans,
        countTiles,
        getAllTiles
    };
})();
