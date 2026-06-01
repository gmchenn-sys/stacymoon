// Cloudflare Pages Function: /api/tts
// Google Translate TTS for simplicity and reliability

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const text = url.searchParams.get('text') || '你好';
  const clean = text.replace(/[*_#`~>\-\[\]（）\(\)\n\r]/g, '').slice(0, 200);

  const ttsUrl = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=' + encodeURIComponent(clean);
  const res = await fetch(ttsUrl);

  return new Response(res.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
