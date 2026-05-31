// Cloudflare Pages Function: /api/tts
// Proxies Microsoft Edge TTS — natural gentle female voice

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const text = url.searchParams.get('text') || '你好';
  const clean = text.replace(/[*_#`~>\-\[\]（）\(\)\n]/g, '').slice(0, 200);

  const res = await fetch(
    'https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
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
