/**
 * 万能麻将 - 玩家类
 */

class Player extends Utils.EventEmitter {
    constructor(id, name, isAI = false) {
        super();
        this.id = id;
        this.name = name;
        this.isAI = isAI;
        this.hand = [];
        this.melds = [];
        this.discards = [];
        this.score = 0;
        this.position = 0; // 0=东,1=南,2=西,3=北
        this.isDealer = false;
        this.queYiMen = null; // 四川麻将缺门
        this.flowers = [];
        this.gangCount = 0;
        this.isReady = false;
        this.isHu = false;
    }

    reset() {
        this.hand = [];
        this.melds = [];
        this.discards = [];
        this.flowers = [];
        this.gangCount = 0;
        this.isReady = false;
        this.isHu = false;
    }

    draw(tile) {
        this.hand.push(tile);
        this.hand = Tiles.sortTiles(this.hand);
        this.emit('draw', tile);
        return tile;
    }

    discard(tileId) {
        const index = this.hand.findIndex(t => t.id === tileId);
        if (index === -1) return null;
        const tile = this.hand.splice(index, 1)[0];
        this.discards.push(tile);
        this.emit('discard', tile);
        return tile;
    }

    addMeld(meld) {
        this.melds.push(meld);
        this.emit('meld', meld);
    }

    removeFromHand(tiles) {
        for (const tile of tiles) {
            const index = this.hand.findIndex(t => t.id === tile.id);
            if (index !== -1) {
                this.hand.splice(index, 1);
            }
        }
        this.hand = Tiles.sortTiles(this.hand);
    }

    addScore(delta) {
        this.score += delta;
        this.emit('scoreChange', this.score);
    }

    setQueYiMen(suit) {
        this.queYiMen = suit;
    }

    getQueYiMenTiles() {
        if (!this.queYiMen) return [];
        return this.hand.filter(t => t.suit === this.queYiMen);
    }

    getHandSize() {
        return this.hand.length;
    }

    hasTile(tile) {
        return this.hand.some(t => Tiles.isSameTile(t, tile));
    }

    findTiles(predicate) {
        return this.hand.filter(predicate);
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            isAI: this.isAI,
            score: this.score,
            position: this.position,
            isDealer: this.isDealer,
            handSize: this.hand.length,
            melds: this.melds,
            discards: this.discards.map(t => t.id),
            flowers: this.flowers,
            isHu: this.isHu,
            gangCount: this.gangCount
        };
    }
}
