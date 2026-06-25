// Cloudflare Pages Function: /api/voice-session
// 代理到 Christine 语音服务，解决 HTTPS → HTTP Mixed Content

export async function onRequestPost(context) {
  try {
    const res = await fetch('http://43.128.150.218:8002/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await context.request.json()),
    });

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message || 'Voice proxy error' }, { status: 502 });
  }
}
