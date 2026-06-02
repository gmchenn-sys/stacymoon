// Stacy Moon — App Logic

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

  const logs = JSON.parse(localStorage.getItem('stacy_logs') || '[]');
  logs.push({ time: timeStr, userMessage, aiReply });
  if (logs.length > 20) logs.shift();
  localStorage.setItem('stacy_logs', JSON.stringify(logs));

  try {
    await fetch(`${window.SUPABASE_URL}/rest/v1/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_KEY,
        'Authorization': `Bearer ${window.SUPABASE_KEY}`,
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

// ── 流式气泡（AI 边生成边显示）──────────────────────
function createStreamingBubble() {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ai';
  div.innerHTML = '<span class="avatar">🌙</span><div class="bubble ai-bubble"></div>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function updateStreamingBubble(el, text) {
  const bubble = el.querySelector('.ai-bubble');
  if (bubble) bubble.textContent = text;
  const box = document.getElementById('chat-box');
  box.scrollTop = box.scrollHeight;
}

function finalizeStreamingBubble(el, text) {
  const bubble = el.querySelector('.ai-bubble');
  if (bubble) bubble.textContent = text;
}

function removeStreamingBubble(el) {
  if (el) el.remove();
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// ═══════════════════════════════════════════════════════════
// ── 语音对话（打电话式）─────────────────────────
// ═══════════════════════════════════════════════════════════

const voiceBtn = document.getElementById('voice-btn');
const voiceIcon = document.getElementById('voice-icon');

let voiceActive = false;
let isSpeaking = false;        // TTS 正在播放中，禁止 STT
let currentAudio = null;
let currentTtsQueue = null;

// ── 麦克风按钮图标切换 ────────────────────────

const MIC_ICON = `<path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`;
const STOP_ICON = `<rect x="6" y="6" width="12" height="12" rx="2"/>`;

function setMicIcon(type) {
  if (!voiceIcon) return;
  voiceIcon.innerHTML = type === 'stop' ? STOP_ICON : MIC_ICON;
}

// ═══════════════════════════════════════════════════════════
// ── 讯飞 STT 语音听写（实时流式）───────────────
//    点击开始 → 建 WS+录音 → 实时发送音频 → 再点停止 → 自动识别
// ═══════════════════════════════════════════════════════════

const STT_CREDS = {
  appId: '08c139a2',
  apiKey: '066b43f2c74d2c4c82fb60f4754f676b',
  apiSecret: 'NWI5YWRjODE1OTMwYjE2MjFjZTNlOWYw',
};

// 会话级状态（一次录音=一个会话）
let sttActive = false;       // 是否在录音会话中
let sttStream = null;        // MediaStream
let sttAudioCtx = null;      // AudioContext
let sttProcessor = null;     // ScriptProcessorNode
let sttWs = null;            // WebSocket
let sttFinalText = '';       // 累积的最终识别结果
let sttFrameSent = 0;        // 已发送音频帧数

// 鉴权
async function buildSttWsUrl() {
  const host = 'iat-api.xfyun.cn';
  const date = new Date().toUTCString();
  const signOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`;

  const key = await crypto.subtle.importKey('raw',
    new TextEncoder().encode(STT_CREDS.apiSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigRaw = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signOrigin));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigRaw)));

  const authOrigin = `api_key="${STT_CREDS.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = btoa(authOrigin);
  return `wss://${host}/v2/iat?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
}

function float32ToInt16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function extractSttText(result) {
  if (!result?.ws) return '';
  let text = '';
  for (const seg of result.ws) {
    if (seg.cw) for (const w of seg.cw) text += w.w || '';
  }
  return text;
}

// ── 开始录音（建 WS + 开麦）───────────────────

async function startRecording() {
  if (sttActive) return;
  console.log('[IAT] startRecording 开始');

  try {
    // 1) 先鉴权建 WebSocket
    console.log('[IAT] 鉴权中...');
    const wsUrl = await buildSttWsUrl();
    console.log('[IAT] 鉴权完成, 连接 WS...');
    sttWs = new WebSocket(wsUrl);
    sttFinalText = '';
    sttFrameSent = 0;

    sttWs.onopen = async () => {
      console.log('[IAT] WebSocket 已连接');
      // 发送参数帧
      sttWs.send(JSON.stringify({
        common: { app_id: STT_CREDS.appId },
        business: { language: 'zh_cn', domain: 'iat', accent: 'mandarin', aue: 'raw', auf: 'audio/L16;rate=16000', vad_eos: 5000 },
        data: { status: 0, format: 'audio/L16;rate=16000', encoding: 'raw' }
      }));
      console.log('[IAT] 参数帧已发送');

      // 2) WS 就绪后再开麦克风
      try {
        sttStream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
        });
        sttAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = sttAudioCtx.createMediaStreamSource(sttStream);

        sttProcessor = sttAudioCtx.createScriptProcessor(4096, 1, 1);
        sttProcessor.onaudioprocess = (e) => {
          if (!sttWs || sttWs.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const int16 = float32ToInt16(inputData);
          const base64 = arrayBufferToBase64(int16.buffer);
          sttWs.send(JSON.stringify({
            data: { status: 1, format: 'audio/L16;rate=16000', encoding: 'raw', audio: base64 }
          }));
          sttFrameSent++;
        };

        source.connect(sttProcessor);
        sttProcessor.connect(sttAudioCtx.destination);

        sttActive = true;
        voiceBtn.classList.add('voice-active');
        setMicIcon('mic');
        console.log('[IAT] 麦克风已开启，实时发送音频帧...');
      } catch (e) {
        console.error('[IAT] 麦克风失败:', e);
        cleanupStt();
        if (e.name === 'NotAllowedError') {
          appendBubble('ai', '需要麦克风权限才能语音对话 🌙');
        }
      }
    };

    sttWs.onmessage = (e) => {
      console.log('[IAT] 收到消息', e.data.slice(0, 500));
      try {
        const msg = JSON.parse(e.data);
        if (msg.code !== 0) {
          console.warn('[IAT] 讯飞错误:', msg.code, msg.message);
          return;
        }
        if (msg.data?.result) {
          const text = extractSttText(msg.data.result);
          if (text) {
            sttFinalText = text;
            console.log('[IAT] 实时识别:', text);
          }
        }
        if (msg.data?.status === 2) {
          console.log('[IAT] 最终结果:', sttFinalText, '共发送', sttFrameSent, '帧');
          cleanupStt();

          if (sttFinalText.trim() && voiceActive) {
            abortAllTts();
            handleSpeechInput(sttFinalText.trim());
          } else if (voiceActive) {
            appendBubble('ai', '没有听清，请再说一次 🌙');
          }
        }
      } catch {}
    };

    sttWs.onerror = (event) => {
      console.log('[IAT] 错误', event);
      cleanupStt();
      appendBubble('ai', '语音识别连接失败，请重试 🌙');
    };

    sttWs.onclose = (event) => {
      console.log('[IAT] WS 关闭, code=' + event.code);
    };

  } catch (e) {
    console.error('[IAT] 启动失败:', e);
    cleanupStt();
    appendBubble('ai', '语音识别启动失败，请重试 🌙');
  }
}

// ── 停止录音（发送结束帧）─────────────────────

function stopRecording() {
  if (!sttActive) return;
  console.log('[IAT] 停止录音, 已发送', sttFrameSent, '帧');

  sttActive = false;

  // 断开麦克风
  if (sttProcessor) { try { sttProcessor.disconnect(); } catch {} sttProcessor = null; }
  if (sttAudioCtx) { try { sttAudioCtx.close(); } catch {} sttAudioCtx = null; }
  if (sttStream) { sttStream.getTracks().forEach(t => { try { t.stop(); } catch {} }); sttStream = null; }

  // 发送结束帧（WS 可能还在等待连接，延迟发送）
  const sendEnd = () => {
    if (sttWs && sttWs.readyState === WebSocket.OPEN) {
      sttWs.send(JSON.stringify({
        data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' }
      }));
      console.log('[IAT] 结束帧已发送');
    } else if (sttWs && sttWs.readyState === WebSocket.CONNECTING) {
      // WS 还在连接中，等连接成功后再发
      console.log('[IAT] WS 连接中，等待后发送结束帧');
      sttWs.addEventListener('open', () => {
        sttWs.send(JSON.stringify({
          data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' }
        }));
        console.log('[IAT] 延迟结束帧已发送');
      }, { once: true });
    }
  };

  if (sttFrameSent === 0) {
    // 还没发送任何音频帧（WS 可能还在握手），等 WS open 后再处理
    console.log('[IAT] 0 帧发送，等待 WS 就绪');
    if (sttWs && sttWs.readyState === WebSocket.CONNECTING) {
      sttWs.addEventListener('open', () => {
        if (sttWs && sttWs.readyState === WebSocket.OPEN) {
          sttWs.send(JSON.stringify({
            data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' }
          }));
          console.log('[IAT] 直接结束帧');
        }
      }, { once: true });
    } else {
      sendEnd();
    }
  } else {
    sendEnd();
  }
}

// ── 清理所有 STT 资源 ────────────────────────

function cleanupStt() {
  sttActive = false;
  sttFinalText = '';
  sttFrameSent = 0;
  if (sttProcessor) { try { sttProcessor.disconnect(); } catch {} sttProcessor = null; }
  if (sttAudioCtx) { try { sttAudioCtx.close(); } catch {} sttAudioCtx = null; }
  if (sttStream) { sttStream.getTracks().forEach(t => { try { t.stop(); } catch {} }); sttStream = null; }
  if (sttWs) { try { sttWs.close(); } catch {} sttWs = null; }
  voiceBtn.classList.remove('voice-active');
  setMicIcon('mic');
}

// ── 数字 → 中文转换（TTS 前预处理）────────────────────

const DIGIT_MAP = { '0':'零','1':'一','2':'二','3':'三','4':'四','5':'五','6':'六','7':'七','8':'八','9':'九' };

function numToCN(n) {
  if (n === 0) return '零';
  let s = '';
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor((n % 1000) / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;

  if (thousands) { s += DIGIT_MAP[thousands] + '千'; if (!hundreds && (tens || ones)) s += '零'; }
  if (hundreds) { s += DIGIT_MAP[hundreds] + '百'; if (!tens && ones) s += '零'; }
  if (tens) {
    if (tens === 1 && !thousands && !hundreds) s += '十';
    else s += DIGIT_MAP[tens] + '十';
  }
  if (ones) s += DIGIT_MAP[ones];
  return s;
}

function decimalToCN(s) {
  const [int, dec] = s.split('.');
  let r = numToCN(parseInt(int));
  r += '点';
  for (const c of dec) r += DIGIT_MAP[c] || c;
  return r;
}

const UNIT_CN = {
  'mg': '毫克','g': '克','kg': '公斤',
  'ml': '毫升','l': '升',
  'min': '分钟','h': '小时',
  'cm': '厘米','m': '米','mm': '毫米',
  'kcal': '千卡','cal': '卡',
};

function normalizeTtsText(text) {
  if (!text) return '';
  let result = text.replace(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)([a-zA-Z]*)/g, (_, a, b, unit) => {
    const cnA = a.includes('.') ? decimalToCN(a) : numToCN(parseInt(a));
    const cnB = b.includes('.') ? decimalToCN(b) : numToCN(parseInt(b));
    const cnUnit = unit ? (UNIT_CN[unit.toLowerCase()] || unit) : '';
    return cnA + '到' + cnB + cnUnit;
  });
  result = result.replace(/(?<![到\d])(\d+(?:\.\d+)?)([a-zA-Z]+)/g, (_, num, unit) => {
    const cn = num.includes('.') ? decimalToCN(num) : numToCN(parseInt(num));
    const cnUnit = UNIT_CN[unit.toLowerCase()] || unit;
    return cn + cnUnit;
  });
  return result.replace(/[^一-龥a-zA-Z0-9，。！？、：；到千百零一二三四五六七八九点]/g, '').slice(0, 150);
}

function cleanTtsText(text) {
  return normalizeTtsText(text || '');
}

// ── TTS 请求/播放 ──────────────────────────────

async function fetchTtsBlob(text) {
  const clean = cleanTtsText(text);
  if (!clean) return null;
  try {
    const res = await fetch(`/api/tts?text=${encodeURIComponent(clean)}`);
    if (res.ok) return await res.blob();
  } catch {}
  return null;
}

async function playTtsBlob(blob) {
  if (!blob || !voiceActive) return;
  voiceBtn.classList.add('voice-speaking');
  voiceBtn.classList.add('voice-active');
  setMicIcon('stop');
  try {
    const objUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(objUrl);
    currentAudio.volume = 1.0;
    await currentAudio.play();
    await new Promise(r => {
      currentAudio.onended = () => { URL.revokeObjectURL(objUrl); currentAudio = null; r(); };
      currentAudio.onerror = () => { URL.revokeObjectURL(objUrl); currentAudio = null; r(); };
    });
  } finally {
    voiceBtn.classList.remove('voice-speaking');
    voiceBtn.classList.remove('voice-active');
    setMicIcon('mic');
  }
}

// ── 停止所有 TTS ─────────────────────────────

function abortAllTts() {
  if (currentTtsQueue) { currentTtsQueue.length = 0; }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.speechSynthesis.cancel();
  isSpeaking = false;
  voiceBtn.classList.remove('voice-speaking', 'voice-active');
  setMicIcon('mic');
}

// ── 处理语音输入 ──────────────────────────────

async function handleSpeechInput(text) {
  console.log('[VOICE] handleSpeechInput:', text.slice(0, 20));
  if (!text) return;
  appendBubble('user', text);

  const aiBubble = createStreamingBubble();

  const ttsQueue = [];
  currentTtsQueue = ttsQueue;
  let ttsProcessing = false;

  async function drainTtsQueue() {
    if (ttsProcessing) return;
    console.log('[TTS] drainTtsQueue 开始, 队列:', ttsQueue.length);

    isSpeaking = true;
    if (sttActive) { stopRecording(); }
    console.log('[TTS] isSpeaking=true, 录音已停止');

    ttsProcessing = true;

    while (ttsQueue.length > 0 && voiceActive && isSpeaking) {
      const item = ttsQueue.shift();
      console.log('[TTS] 播放:', item.sentence.slice(0, 20), '剩余:', ttsQueue.length);

      const blob = await item.promise;
      if (blob && voiceActive && isSpeaking) {
        await playTtsBlob(blob);
      }

      if (voiceActive && isSpeaking && ttsQueue.length > 0) {
        console.log('[TTS] 句子间停顿 30ms');
        await new Promise(r => setTimeout(r, 30));
      }
    }

    currentTtsQueue = null;
    ttsProcessing = false;

    isSpeaking = false;
    console.log('[TTS] drainTtsQueue 完成, isSpeaking=false');
  }

  function enqueueTts(sentence) {
    console.log('[TTS] enqueueTts+预加载:', sentence.slice(0, 20));
    const promise = fetchTtsBlob(sentence);
    ttsQueue.push({ sentence, promise });
    drainTtsQueue();
  }

  let streamedText = '';
  try {
    const fullReply = await askStacyStream(text,
      (sentence) => { enqueueTts(sentence); },
      (char) => {
        streamedText += char;
        updateStreamingBubble(aiBubble, streamedText);
      }
    );

    finalizeStreamingBubble(aiBubble, fullReply);
    if (window.notifyDaughter) notifyDaughter(text, fullReply);
    saveLog(text, fullReply);

    while ((ttsQueue.length > 0 || ttsProcessing) && voiceActive) {
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (e) {
    console.error('Stacy 请求失败:', e);
    removeStreamingBubble(aiBubble);
    appendBubble('ai', '网络有点问题，稍后再试一下 🌙');
    saveLog(text, '');
    isSpeaking = false;
    if (voiceActive) { /* user taps mic to record next */ }
  }
}

// ── 关闭语音 ─────────────────────────────────

function stopVoice() {
  voiceActive = false;
  isSpeaking = false;
  cleanupStt();
  abortAllTts();
  voiceBtn.classList.remove('voice-active', 'voice-speaking');
  setMicIcon('mic');
}

// ── 打断当前 TTS（手动点击）───────────────

function interruptSpeaking() {
  console.log('[INTERRUPT] 手动打断 TTS');
  abortAllTts();
  currentTtsQueue = null;
  isSpeaking = false;
}

// ── 麦克风按钮 ────────────────────────────────

voiceBtn.addEventListener('click', async () => {
  // iOS: unlock AudioContext
  if (!window._audioUnlocked) {
    window._audioUnlocked = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }

  // TTS 播放中点击 → 打断
  if (isSpeaking) {
    interruptSpeaking();
    appendBubble('ai', '好的，你说 🌙');
    return;
  }

  // 正在录音中点击 → 停止录音并自动识别
  if (sttActive) {
    stopRecording();
    appendBubble('ai', '好的，让我想想 🌙');
    return;
  }

  // 通话中但没在录音 → 挂断
  if (voiceActive) {
    stopVoice();
    appendBubble('ai', '语音已结束 🌙');
    return;
  }

  // 空闲 → 开启通话 + 开始录音
  voiceActive = true;
  isSpeaking = false;
  appendBubble('ai', '请说话 🌙');
  startRecording();
});
