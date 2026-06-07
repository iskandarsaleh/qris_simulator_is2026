const { createClient } = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.connected = false;
    this.store = {};       // in-memory fallback hash store
    this.lists = {};       // in-memory fallback list store
    this.counters = {};    // in-memory fallback counters
  }

  async connect() {
    try {
      this.client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
      this.client.on('error', (err) => {
        console.warn('⚠️  Redis error, using in-memory fallback:', err.message);
        this.connected = false;
      });
      this.client.on('connect', () => {
        console.log('✅ Redis connected');
        this.connected = true;
      });
      await this.client.connect();
    } catch (err) {
      console.warn('⚠️  Redis unavailable, using in-memory fallback');
      this.connected = false;
    }
  }

  async set(key, value, ttl = 86400) {
    const v = JSON.stringify(value);
    if (this.connected) {
      await this.client.setEx(key, ttl, v);
    } else {
      this.store[key] = { value: v, expires: Date.now() + ttl * 1000 };
    }
    return true;
  }

  async get(key) {
    if (this.connected) {
      const d = await this.client.get(key);
      return d ? JSON.parse(d) : null;
    }
    const entry = this.store[key];
    if (!entry) return null;
    if (Date.now() > entry.expires) { delete this.store[key]; return null; }
    return JSON.parse(entry.value);
  }

  async del(key) {
    if (this.connected) { await this.client.del(key); }
    else { delete this.store[key]; delete this.lists[key]; }
    return true;
  }

  async keys(pattern) {
    if (this.connected) return this.client.keys(pattern);
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Object.keys(this.store).filter(k => regex.test(k));
  }

  async lpush(key, value) {
    if (this.connected) {
      await this.client.lPush(key, JSON.stringify(value));
    } else {
      if (!this.lists[key]) this.lists[key] = [];
      this.lists[key].unshift(JSON.stringify(value));
    }
    return true;
  }

  async lrange(key, start, stop) {
    if (this.connected) {
      const data = await this.client.lRange(key, start, stop);
      return data.map(d => JSON.parse(d));
    }
    const list = this.lists[key] || [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end).map(d => JSON.parse(d));
  }

  async incr(key) {
    if (this.connected) return this.client.incr(key);
    this.counters[key] = (this.counters[key] || 0) + 1;
    return this.counters[key];
  }

  async hset(hash, field, value) {
    if (this.connected) {
      await this.client.hSet(hash, field, JSON.stringify(value));
    } else {
      if (!this.store[hash]) this.store[hash] = {};
      this.store[hash][field] = JSON.stringify(value);
    }
    return true;
  }

  async hget(hash, field) {
    if (this.connected) {
      const d = await this.client.hGet(hash, field);
      return d ? JSON.parse(d) : null;
    }
    const h = this.store[hash];
    return h && h[field] ? JSON.parse(h[field]) : null;
  }

  async hgetall(hash) {
    if (this.connected) {
      const data = await this.client.hGetAll(hash);
      const r = {};
      for (const [k, v] of Object.entries(data)) r[k] = JSON.parse(v);
      return r;
    }
    const h = this.store[hash] || {};
    const r = {};
    for (const [k, v] of Object.entries(h)) r[k] = JSON.parse(v);
    return r;
  }

  async hdel(hash, field) {
    if (this.connected) { await this.client.hDel(hash, field); }
    else if (this.store[hash]) { delete this.store[hash][field]; }
    return true;
  }

  isConnected() { return this.connected; }
}

module.exports = new RedisService();
