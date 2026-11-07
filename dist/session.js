const KEY = 'listening-room:spotify:07b1ada0402a412f94212b95447117d3';
export function createSessionStore(storage, now = () => Date.now()) {
  const clear = () => { try { storage.removeItem(KEY); } catch {} };
  return {
    clear,
    save(token) { try { storage.setItem(KEY, JSON.stringify(token)); } catch {} },
    load() {
      try {
        const token = JSON.parse(storage.getItem(KEY));
        if (!token) return null;
        if (typeof token.access_token !== 'string' || !token.access_token || !Number.isFinite(token.expires_at) ||
            (!token.refresh_token && token.expires_at <= now()) ||
            (token.refresh_token !== undefined && (typeof token.refresh_token !== 'string' || !token.refresh_token))) {
          clear(); return null;
        }
        return token;
      } catch { clear(); return null; }
    }
  };
}
