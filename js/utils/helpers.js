/**
 * 万能麻将 - 工具函数
 */

const Utils = {
    /**
     * 生成随机整数 [min, max)
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    },

    /**
     * 洗牌算法 (Fisher-Yates)
     */
    shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = this.randomInt(0, i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    /**
     * 延迟函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * 防抖函数
     */
    debounce(fn, delay) {
        let timer = null;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * 节流函数
     */
    throttle(fn, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * 深拷贝
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * 格式化日期
     */
    formatDate(date = new Date()) {
        const d = new Date(date);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    /**
     * 生成唯一ID
     */
    uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * Toast提示
     */
    toast(message, duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    },

    /**
     * 确认对话框
     */
    confirm(message) {
        return new Promise(resolve => {
            const result = window.confirm(message);
            resolve(result);
        });
    },

    /**
     * 数组分组
     */
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const group = item[key];
            result[group] = result[group] || [];
            result[group].push(item);
            return result;
        }, {});
    },

    /**
     * 数组计数
     */
    countBy(array, key) {
        return array.reduce((result, item) => {
            const val = item[key];
            result[val] = (result[val] || 0) + 1;
            return result;
        }, {});
    },

    /**
     * 扁平化数组
     */
    flatten(array) {
        return array.reduce((flat, item) => 
            flat.concat(Array.isArray(item) ? this.flatten(item) : item), []);
    },

    /**
     * 比较两个数组是否相等（忽略顺序）
     */
    arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        const sortedA = [...a].sort();
        const sortedB = [...b].sort();
        return sortedA.every((val, i) => val === sortedB[i]);
    },

    /**
     * 获取对象所有可能的组合
     */
    combinations(array, k) {
        if (k === 0) return [[]];
        if (array.length < k) return [];
        if (k === 1) return array.map(x => [x]);
        
        const result = [];
        for (let i = 0; i <= array.length - k; i++) {
            const subCombinations = this.combinations(array.slice(i + 1), k - 1);
            for (const sub of subCombinations) {
                result.push([array[i], ...sub]);
            }
        }
        return result;
    },

    /**
     * 事件发射器
     */
    EventEmitter: class EventEmitter {
        constructor() {
            this.events = {};
        }
        on(event, callback) {
            this.events[event] = this.events[event] || [];
            this.events[event].push(callback);
            return () => this.off(event, callback);
        }
        off(event, callback) {
            if (!this.events[event]) return;
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        }
        emit(event, ...args) {
            if (!this.events[event]) return;
            this.events[event].forEach(cb => cb(...args));
        }
        once(event, callback) {
            const onceWrapper = (...args) => {
                callback(...args);
                this.off(event, onceWrapper);
            };
            this.on(event, onceWrapper);
        }
    }
};
