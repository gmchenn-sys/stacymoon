// Debug: /api/tts-test — prints raw iFlytek response
export async function onRequest({ request }) {
  const APPID = '08c139a2';
  const API_KEY = '066b43f2c74d2c4c82fb60f4754f676b';
  const API_SECRET = 'NWI5YWRjODE1OTMwYjE2MjFjZTNlOWYw';

  const url = new URL(request.url);
  const text = url.searchParams.get('text') || '你好';

  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

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

  const log = [];
  log.push(`WS URL: ${wsUrl.substring(0, 80)}...`);
  log.push(`Text: ${text}`);

  const ws = new WebSocket(wsUrl);
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => { resolve({ error: 'timeout after 12s', log }); try { ws.close(); } catch {} }, 12000);

    ws.onopen = () => {
      log.push('WS opened');
      const reqData = {
        common: { app_id: APPID },
        business: {
          aue: 'lame',
          auf: 'audio/L16;rate=16000',
          vcn: 'aisxping',
          speed: 50,
          volume: 80,
          pitch: 50,
          tte: 'UTF8'
        },
        data: { status: 2, text: toBase64(text) }
      };
      ws.send(JSON.stringify(reqData));
      log.push('Sent: ' + JSON.stringify(reqData).substring(0, 200));
    };

    ws.onmessage = (e) => {
      log.push('Received: ' + e.data.substring(0, 500));
      try {
        const msg = JSON.parse(e.data);
        if (msg.code !== 0 || msg.data?.status === 2) {
          clearTimeout(timer);
          resolve({ code: msg.code, message: msg.message, sid: msg.sid, data_status: msg.data?.status, log });
          ws.close();
        }
      } catch {}
    };

    ws.onerror = (e) => { log.push('WS error'); clearTimeout(timer); resolve({ error: 'WS error', log }); };
    ws.onclose = (e) => { log.push(`WS closed code=${e.code}`); clearTimeout(timer); resolve({ closed: true, code: e.code, log }); };
  });

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
