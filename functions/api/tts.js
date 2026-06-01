// Cloudflare Pages Function: /api/tts
// Uses Microsoft Edge TTS (free, no API key)

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(
    'https://southeastasia.api.cognitive.microsoft.com/sts/v1.0/issuetoken',
    { method: 'POST', headers: { 'User-Agent': 'StacyMoon/1.0' } }
  );
  cachedToken = await res.text();
  tokenExpiry = Date.now() + 500000; // ~8 min
  return cachedToken;
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const text = url.searchParams.get('text') || '你好';
  const clean = text.replace(/[*_#`~>\-\[\]（）\(\)\n]/g, '').slice(0, 200);

  const token = await getToken();

  const res = await fetch(
    'https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'StacyMoon/1.0'
      },
      body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
                   xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
        <voice name="zh-CN-XiaoxiaoNeural">
          <mstts:express-as style="gentle" styledegree="2">
            <prosody rate="-5%" pitch="+3%">${clean}</prosody>
          </mstts:express-as>
        </voice>
      </speak>`
    }
  );

  return new Response(res.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
