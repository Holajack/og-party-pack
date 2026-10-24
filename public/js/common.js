// Shared helpers for the big screen and the phones.

export const $ = (sel, root = document) => root.querySelector(sel);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// localStorage can throw (private mode, blocked storage); never let it break the game.
export const store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

// The server's clock may differ from this device's; timers use server time.
let clockOffset = 0;
export function syncClock(serverNow) {
  if (typeof serverNow === 'number') clockOffset = serverNow - Date.now();
}

export function msLeft(timer) {
  if (!timer) return 0;
  if (timer.paused) return timer.remaining ?? 0;
  return Math.max(0, timer.endsAt - (Date.now() + clockOffset));
}

export function avatar(p, extra = '') {
  return `<span class="avatar ${extra}" style="--c:${esc(p.color)}" title="${esc(p.name)}">${esc(p.avatar)}</span>`;
}

// "John 3:16" → "John 3:16 (BSB)". Leaves "Not in the Bible" alone.
export function withBible(ref, bible) {
  return /\d+:\d+/.test(ref || '') && bible ? `${ref} (${bible})` : ref || '';
}

export function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Swap in a new screen when `key` changes. When it doesn't, only refresh the
// parts marked data-live (keeping inputs, canvases and animations intact).
// Inside a live region, children with data-id are matched up so existing
// items stay put and only new ones animate in.
export function createPainter(root) {
  let currentKey = null;
  const paint = function (key, html, onMount) {
    if (key !== currentKey) {
      currentKey = key;
      root.innerHTML = html;
      onMount?.(root);
      return true;
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    for (const fresh of tpl.content.querySelectorAll('[data-live]')) {
      const old = root.querySelector(`[data-live="${fresh.dataset.live}"]`);
      if (!old || old.outerHTML === fresh.outerHTML) continue;
      if (fresh.hasAttribute('data-keyed')) patchKeyed(old, fresh);
      else old.replaceWith(fresh);
    }
    return false;
  };
  // Force the next paint to rebuild the whole screen.
  paint.reset = () => (currentKey = null);
  return paint;
}

function patchKeyed(oldEl, newEl) {
  for (const attr of newEl.getAttributeNames()) oldEl.setAttribute(attr, newEl.getAttribute(attr));
  const existing = new Map([...oldEl.children].map((c) => [c.dataset.id, c]));
  const next = [...newEl.children].map((c) => {
    const prev = existing.get(c.dataset.id);
    return prev && prev.outerHTML === c.outerHTML ? prev : c;
  });
  oldEl.replaceChildren(...next);
}

// Keep the screen awake while the game is open (where supported).
export function keepAwake() {
  let lock = null;
  const request = async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !lock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => (lock = null));
      }
    } catch {
      /* not allowed or not supported */
    }
  };
  document.addEventListener('visibilitychange', request);
  document.addEventListener('pointerdown', request, { once: true });
  request();
}

export const GAME_THEMES = ['lobby', 'realornot', 'bluff', 'whosaid', 'whichbook', 'timeline', 'draw', 'laughs'];
