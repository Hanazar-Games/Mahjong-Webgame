/**
 * 万能麻将 - 本地存储系统
 */

const Storage = (function() {
    'use strict';

    const PREFIX = 'mahjong_';

    function get(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(PREFIX + key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            console.error('Storage get error:', e);
            return defaultValue;
        }
    }

    function set(key, value) {
        try {
            localStorage.setItem(PREFIX + key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Storage set error:', e);
            return false;
        }
    }

    function remove(key) {
        localStorage.removeItem(PREFIX + key);
    }

    function clear() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(PREFIX)) {
                keys.push(key);
            }
        }
        for (const key of keys) {
            localStorage.removeItem(key);
        }
    }

    return { get, set, remove, clear };
})();
