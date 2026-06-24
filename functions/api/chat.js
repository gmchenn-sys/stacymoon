// Cloudflare Pages Function: /api/chat
// 代理转发到 Agent Server，避免前端 Mixed Content

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const res = await fetch('https://stacymoon.online/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message || 'Agent proxy error' }, { status: 502 });
  }
}
