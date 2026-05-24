// Stacy Moon — App Logic

const SUPABASE_URL = 'https://gqahwfuuvoumfxdhfugt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EBDC3H5J_WdUSWXmZwndJg_GsGBHN2S';

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  appendBubble('user', text);
  input.value = '';

  const loadingId = appendLoading();

  try {
    const reply = await askStacy(text);
    removeLoading(loadingId);
    appendBubble('ai', reply);
    if (window.notifyDaughter) notifyDaughter(text, reply);
    saveLog(text, reply);
  } catch (e) {
    console.error('Stacy 请求失败:', e);
    removeLoading(loadingId);
    const fallback = '网络有点问题，稍后再试一下 🌙';
    appendBubble('ai', fallback);
    saveLog(text, fallback);
  }
}

async function saveLog(userMessage, aiReply) {
  const now = new Date();
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

  // 同时写 localStorage（本地备份）和 Supabase（跨设备）
  const logs = JSON.parse(localStorage.getItem('stacy_logs') || '[]');
  logs.push({ time: timeStr, userMessage, aiReply });
  if (logs.length > 20) logs.shift();
  localStorage.setItem('stacy_logs', JSON.stringify(logs));

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ user_message: userMessage, ai_reply: aiReply })
    });
  } catch (e) {
    console.warn('Supabase 写入失败:', e);
  }
}

function appendBubble(role, text) {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ' + role;
  div.innerHTML = role === 'ai'
    ? `<span class="avatar">🌙</span><div class="bubble ai-bubble">${text}</div>`
    : `<div class="bubble user-bubble">${text}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

let loadingCounter = 0;
function appendLoading() {
  const id = 'loading-' + (++loadingCounter);
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ai';
  div.id = id;
  div.innerHTML = `<span class="avatar">🌙</span><div class="bubble ai-bubble loading-bubble">Stacy 正在回复…</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function removeLoading(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// ── ElevenLabs 语音对话（WebSocket 直连）──────────────────────────
const AGENT_ID = 'agent_5201ksacn1dqe9g83y6e3d8b88jh';
const voiceBtn = document.getElementById('voice-btn');

let ws = null;
let audioCtx = null;
let mediaStream = null;
let mediaProcessor = null;
let voiceActive = false;

let audioQueue = [];
let isPlaying = false;
let playbackCtx = null;

function getPlaybackCtx() {
  if (!playbackCtx || playbackCtx.state === 'closed') {
    playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return playbackCtx;
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function playNextInQueue() {
  if (isPlaying || audioQueue.length === 0) return;
  isPlaying = true;
  const b64 = audioQueue.shift();
  try {
    const ctx = getPlaybackCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const buffer = await ctx.decodeAudioData(base64ToArrayBuffer(b64));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    voiceBtn.classList.add('voice-speaking');
    source.onended = () => {
      isPlaying = false;
      voiceBtn.classList.remove('voice-speaking');
      playNextInQueue();
    };
    source.start(0);
  } catch (e) {
    console.warn('audio error:', e);
    isPlaying = false;
    voiceBtn.classList.remove('voice-speaking');
    playNextInQueue();
  }
}

function enqueueAudio(base64) {
  audioQueue.push(base64);
  playNextInQueue();
}

async function startMic() {
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(mediaStream);
  mediaProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
  source.connect(mediaProcessor);
  mediaProcessor.connect(audioCtx.destination);

  mediaProcessor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const float32 = e.inputBuffer.getChannelData(0);
    const ratio = audioCtx.sampleRate / 16000;
    const outLen = Math.floor(float32.length / ratio);
    const i16 = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const s = float32[Math.floor(i * ratio)];
      i16[i] = Math.max(-32768, Math.min(32767, s * 32768));
    }
    const bytes = new Uint8Array(i16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    ws.send(JSON.stringify({ user_audio_chunk: btoa(binary) }));
  };
}

async function startVoice() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    appendBubble('ai', '需要麦克风权限才能语音对话，请在浏览器设置中允许 🌙');
    return;
  }

  voiceBtn.classList.add('voice-active');
  appendBubble('ai', '正在连接语音… 🌙');

  ws = new WebSocket(
    `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT_ID}`
  );

  ws.onopen = async () => {
    ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
    try {
      await startMic();
      voiceActive = true;
      appendBubble('ai', '语音已连接，妈妈请说话 🌙');
    } catch (err) {
      appendBubble('ai', '麦克风启动失败：' + err.message);
      stopVoice();
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'audio' && data.audio_event?.audio_base_64) {
        enqueueAudio(data.audio_event.audio_base_64);
      } else if (data.type === 'ping') {
        setTimeout(() => {
          if (ws?.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'pong', event_id: data.ping_event.event_id }));
        }, data.ping_event.ping_ms || 0);
      }
    } catch (err) {
      console.error('WS message error:', err);
    }
  };

  ws.onerror = (e) => {
    appendBubble('ai', '语音连接出了点问题，可以试试文字 🌙');
    stopVoice();
  };

  ws.onclose = (e) => {
    if (e.code === 1002 && e.reason.includes('quota')) {
      appendBubble('ai', 'ElevenLabs 语音配额已用完 🌙');
    } else if (voiceActive) {
      appendBubble('ai', '语音已断开 🌙');
    }
    stopVoice();
  };
}

function stopVoice() {
  voiceActive = false;
  audioQueue = [];
  isPlaying = false;


  if (mediaProcessor) { mediaProcessor.disconnect(); mediaProcessor = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (ws) { ws.close(); ws = null; }
  voiceBtn.classList.remove('voice-active', 'voice-speaking');
  voiceBtn.title = '语音对话';
}

voiceBtn.addEventListener('click', () => {
  if (voiceActive) {
    stopVoice();
    appendBubble('ai', '语音已结束 🌙');
  } else {
    startVoice();
  }
});
