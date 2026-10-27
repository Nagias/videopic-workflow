// Selector và đoạn JS chạy trong trang muse.ai — chuyển từ Story Studio backend/runners/muse_fleet_runner.py (đo thật 27/10/2026).

export const CHAT_INPUT_SELECTORS = [
  "textarea[aria-label='Message']",
  "textarea[placeholder='Message']",
  "textarea[placeholder*='Nhắn tin' i]",
  "textarea[placeholder*='message' i]",
  "div[contenteditable='true'][role='textbox']",
];

export const NEW_CHAT_SELECTORS = [
  "[data-testid='hatch-chat-compose']",
  "button[aria-label='New side chat']",
  "[aria-label='New side chat']",
];

// Giao diện muse.ai đo ngày 27/10/2026: nút "New side chat" nằm trong menu Chats.
export const CHAT_SWITCHER_SELECTOR = "[data-testid='hatch-chat-switcher-trigger']";
export const NEW_SIDE_CHAT_IN_MENU_SELECTORS = ["button:text-is('New side chat')", "button:text-is('Đoạn chat phụ mới')"];

export const SEND_BUTTON_SELECTOR = "button[aria-label*='send' i], button[aria-label*='gửi' i]";
export const ALLOW_BUTTON_SELECTOR = "[role=log] button:text-is('Cho phép'), [role=log] button:text-is('Allow')";

export const MARK_EXISTING_MEDIA_JS = `() => {
  const srcs = [];
  document.querySelectorAll('img, video, a[href]').forEach(el => {
    el.setAttribute('data-vp-pre', '1');
    const s = el.currentSrc || el.src || el.href;
    if (s) srcs.push(s);
  });
  return srcs;
}`;

export type MediaCandidate = { src: string; how: "link" | "video" };

export const FIND_NEW_VIDEO_JS = `([preSrcs, rejected]) => {
  const pre = new Set(preSrcs), bad = new Set(rejected);
  const logs = [...document.querySelectorAll('[role=log]')];
  const inChat = el => logs.length ? logs.some(l => l.contains(el)) : !!el.closest("[class*='message'], [class*='bubble']");
  const isAvatar = el => !!el.closest("[class*='rounded-full'], [class*='avatar'], [class*='landing']");
  const fresh = (el, src) => src && !el.hasAttribute('data-vp-pre') && !pre.has(src) && !bad.has(src);
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.href || '';
    if (fresh(a, h) && /^https?:/i.test(h) && /\\.mp4(\\?|#|$)/i.test(h) && inChat(a)) out.push({ src: h, how: 'link' });
  }
  for (const v of document.querySelectorAll('video')) {
    const src = v.currentSrc || v.src;
    if (!fresh(v, src) || isAvatar(v) || !inChat(v)) continue;
    if (v.getBoundingClientRect().width < 200) continue;
    if (v.videoWidth && v.videoHeight && v.videoWidth <= v.videoHeight * 1.1) continue;
    if (v.duration && isFinite(v.duration) && v.duration < 3) continue;
    out.push({ src, how: 'video' });
  }
  return out;
}`;

export const LOGIN_WALL_JS = `() => {
  const url = location.href.toLowerCase();
  if (/login|signin|sign-in|auth|accounts\\./.test(url)) return true;
  return [...document.querySelectorAll('a, button')].some(e => /^(log ?in|sign ?in|đăng nhập|continue with)/i.test((e.innerText || '').trim()));
}`;

export const BLOB_TO_DATAURL_JS = `async (blobUrl) => {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}`;

export const SCROLL_CHAT_TO_END_JS = `() => document.querySelectorAll('[role=log]').forEach(l => { l.scrollTop = l.scrollHeight; })`;
