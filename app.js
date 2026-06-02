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
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let voiceActive = false;
let isSpeaking = false;        // 全局：TTS 正在播放中，禁止识别
let currentAudio = null;
let currentTtsQueue = null;    // 当前 TTS 队列引用，用于清空

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
  }
}

// ── 停止所有 TTS ─────────────────────────────

function abortAllTts() {
  if (currentTtsQueue) { currentTtsQueue.length = 0; }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.speechSynthesis.cancel();
}

// ── 语音识别 ─────────────────────────────────

function startRecognition() {
  if (isSpeaking) {
    console.log('[STT] isSpeaking=true，跳过启动识别');
    return;
  }
  console.log('[STT] startRecognition 被调用');

  if (!SpeechRecognition) {
    appendBubble('ai', '当前浏览器不支持语音，请用 Chrome 打开 🌙');
    return;
  }

  // 先确保旧的完全停止
  if (recognition) {
    try { recognition.abort(); } catch {}
    recognition = null;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = async (event) => {
    const text = event.results[0][0].transcript.trim();
    console.log('[STT] 识别结果:', text);
    if (!text || isSpeaking) return;

    // 用户开口说话了 → 停止当前 TTS
    abortAllTts();
    handleSpeechInput(text);
  };

  recognition.onerror = (e) => {
    console.warn('[STT] 错误:', e.error);
    if (e.error === 'no-speech' && voiceActive && !isSpeaking) {
      startRecognition();
    } else if (e.error === 'aborted') {
      // 手动停止，预期行为
    } else {
      if (voiceActive) startRecognition();
    }
  };

  try { recognition.start(); } catch (e) { console.warn('[STT] start 失败:', e); }
}

// ── 处理语音输入 ──────────────────────────────

async function handleSpeechInput(text) {
  console.log('[VOICE] handleSpeechInput:', text.slice(0, 20));
  if (!text) return;
  appendBubble('user', text);

  const aiBubble = createStreamingBubble();

  // TTS 句子队列
  const ttsQueue = [];
  currentTtsQueue = ttsQueue;
  let ttsProcessing = false;

  async function drainTtsQueue() {
    if (ttsProcessing) return;
    console.log('[TTS] drainTtsQueue 开始, 队列:', ttsQueue.length);

    // ── 进入播放态：关识别，设标志 ──
    isSpeaking = true;
    if (recognition) {
      try { recognition.abort(); } catch {}
      recognition = null;
    }
    console.log('[TTS] isSpeaking=true, recognition 已 abort');

    ttsProcessing = true;
    let prefetchedBlob = null;

    while (ttsQueue.length > 0 && voiceActive && isSpeaking) {
      const sentence = ttsQueue.shift();
      console.log('[TTS] 播放:', sentence.slice(0, 20), '剩余:', ttsQueue.length);

      const nextFetch = ttsQueue.length > 0
        ? fetchTtsBlob(ttsQueue[0])
        : Promise.resolve(null);

      if (prefetchedBlob) {
        await playTtsBlob(prefetchedBlob);
      } else {
        const blob = await fetchTtsBlob(sentence);
        if (blob) await playTtsBlob(blob);
      }

      if (voiceActive && isSpeaking && ttsQueue.length > 0) {
        await new Promise(r => setTimeout(r, 30));
      }

      prefetchedBlob = await nextFetch;
    }

    // 播放最后的预加载块
    if (prefetchedBlob && isSpeaking && voiceActive) {
      await playTtsBlob(prefetchedBlob);
    }

    currentTtsQueue = null;
    ttsProcessing = false;

    // ── 退出播放态：清标志，等 500ms 重启识别 ──
    isSpeaking = false;
    console.log('[TTS] drainTtsQueue 完成, isSpeaking=false, 500ms 后重启识别');
    await new Promise(r => setTimeout(r, 500));
    if (voiceActive) startRecognition();
  }

  function enqueueTts(sentence) {
    console.log('[TTS] enqueueTts:', sentence.slice(0, 20));
    ttsQueue.push(sentence);
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

    // 等待 TTS 队列播放完毕
    while ((ttsQueue.length > 0 || ttsProcessing) && voiceActive) {
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (e) {
    console.error('Stacy 请求失败:', e);
    removeStreamingBubble(aiBubble);
    appendBubble('ai', '网络有点问题，稍后再试一下 🌙');
    saveLog(text, '');
    // 出错也要恢复
    isSpeaking = false;
    if (voiceActive) startRecognition();
  }
}

// ── 关闭语音 ─────────────────────────────────

function stopVoice() {
  voiceActive = false;
  isSpeaking = false;
  abortAllTts();
  if (recognition) {
    try { recognition.abort(); } catch {}
    recognition = null;
  }
  voiceBtn.classList.remove('voice-active', 'voice-speaking');
}

// ── 麦克风按钮 ────────────────────────────────

voiceBtn.addEventListener('click', async () => {
  if (voiceActive) {
    // 手动点击 = 挂断
    stopVoice();
    appendBubble('ai', '语音已结束 🌙');
    return;
  }

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    appendBubble('ai', '需要麦克风权限才能语音对话，请在浏览器设置中允许 🌙');
    return;
  }

  voiceActive = true;
  isSpeaking = false;
  voiceBtn.classList.add('voice-active');
  appendBubble('ai', '语音已接通，请说话吧 🌙');
  startRecognition();
});
