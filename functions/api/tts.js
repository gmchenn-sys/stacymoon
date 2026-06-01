// Cloudflare Pages Function: /api/tts
// 讯飞 TTS WebSocket — 温柔女声，国内低延迟

const APPID = '08c139a2';
const API_KEY = '066b43f2c74d2c4c82fb60f4754f676b';
const API_SECRET = 'NWI5YWRjODE1OTMwYjE2MjFjZTNlOWYw';

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function onRequest({ request }) {
  try {
    const url = new URL(request.url);
    const text = (url.searchParams.get('text') || '').replace(/[^一-龥a-zA-Z0-9，。！？、：；]/g, '').slice(0, 100);
    if (!text.trim()) return new Response('{"error":"empty text"}', { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    // ── 鉴权 ──
    const host = 'tts-api.xfyun.cn';
    const date = new Date().toUTCString();
    const signOrigin = `host: ${host}\ndate: ${date}\nGET /v2/tts HTTP/1.1`;

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(API_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigRaw = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signOrigin));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sigRaw)));

    const authOrigin = `api_key="${API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorization = btoa(authOrigin);
    const wsUrl = `wss://${host}/v2/tts?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;

    // ── WebSocket ──
    const ws = new WebSocket(wsUrl);
    const chunks = [];

    let settled = false;
    const audio = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (settled) return; settled = true; try { ws.close(); } catch {}; reject(new Error('TTS timeout')); }, 12000);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          common: { app_id: APPID },
          business: { aue: 'lame', auf: 'audio/L16;rate=16000', vcn: 'x4_yezi', speed: 50, volume: 80, pitch: 50, tte: 'UTF8' },
          data: { status: 2, text: toBase64(text) }
        }));
      };

      ws.onmessage = (e) => {
        if (settled) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.code !== 0) { settled = true; clearTimeout(timer); reject(new Error('iFlytek error ' + msg.code + ': ' + (msg.message || 'unknown'))); return; }
          if (msg.data?.audio) chunks.push(msg.data.audio);
          if (msg.data?.status === 2) { settled = true; clearTimeout(timer); resolve(chunks.join('')); }
        } catch (ex) { settled = true; clearTimeout(timer); reject(new Error("JSON parse: " + e.data.substring(0, 100))); }
      };

      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('WebSocket error')); } };
      ws.onclose = () => { if (!settled && chunks.length) { settled = true; clearTimeout(timer); resolve(chunks.join('')); } };
    });

    // ── 转 MP3 二进制 ──
    const bin = atob(audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    return new Response(bytes, {
      headers: { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'unknown' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
