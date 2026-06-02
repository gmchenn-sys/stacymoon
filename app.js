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

// ── Web Speech API 语音对话（打电话式）────────────────────────
const voiceBtn = document.getElementById('voice-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let voiceActive = false;
let currentAudio = null;

// ── 数字 → 中文转换（TTS 前预处理）────────────────────

const DIGIT_MAP = { '0':'零','1':'一','2':'二','3':'三','4':'四','5':'五','6':'六','7':'七','8':'八','9':'九' };

function numToCN(n) {
  // n 是整数，0-9999
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
  // "1.6" → "一点六", "0.5" → "零点五"
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
  // 1) 数字范围 "200-400mg" → "两百到四百毫克"
  let result = text.replace(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)([a-zA-Z]*)/g, (_, a, b, unit) => {
    const cnA = a.includes('.') ? decimalToCN(a) : numToCN(parseInt(a));
    const cnB = b.includes('.') ? decimalToCN(b) : numToCN(parseInt(b));
    const cnUnit = unit ? (UNIT_CN[unit.toLowerCase()] || unit) : '';
    return cnA + '到' + cnB + cnUnit;
  });
  // 2) 独立数字+单位 "30g" "200mg"（不跟在 "到" 后面，不在范围里）
  result = result.replace(/(?<![到\d])(\d+(?:\.\d+)?)([a-zA-Z]+)/g, (_, num, unit) => {
    const cn = num.includes('.') ? decimalToCN(num) : numToCN(parseInt(num));
    const cnUnit = UNIT_CN[unit.toLowerCase()] || unit;
    return cn + cnUnit;
  });
  // 3) 去标点，限长
  return result.replace(/[^一-龥a-zA-Z0-9，。！？、：；到千百零一二三四五六七八九点]/g, '').slice(0, 150);
}

function cleanTtsText(text) {
  if (!text) return '';
  const normalized = normalizeTtsText(text);
  return normalized;
}

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
  if (!blob || !voiceActive || ttsAborted) return;
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

// ── TTS 打断机制 ─────────────────────────────

let ttsAborted = false;
let currentTtsQueue = null;
let interruptRecognizer = null;

function abortAllTts() {
  ttsAborted = true;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.speechSynthesis.cancel();
  if (currentTtsQueue) { currentTtsQueue.length = 0; }
  if (interruptRecognizer) {
    try { interruptRecognizer.abort(); } catch {}
    interruptRecognizer = null;
  }
}

function startInterruptDetector(onSpeech) {
  if (!SpeechRecognition) return;
  abortAllTts(); // 上一轮如有残留先清理

  interruptRecognizer = new SpeechRecognition();
  interruptRecognizer.lang = 'zh-CN';
  interruptRecognizer.continuous = false;
  interruptRecognizer.interimResults = false;

  interruptRecognizer.onspeechstart = () => {
    console.log('[INTERRUPT] 检测到用户开始说话，打断 TTS');
    abortAllTts();
  };

  interruptRecognizer.onresult = (event) => {
    const text = event.results[0][0].transcript.trim();
    console.log('[INTERRUPT] 识别到打断语音:', text);
    if (text && voiceActive) {
      try { interruptRecognizer.abort(); } catch {}
      interruptRecognizer = null;
      onSpeech(text);
    }
  };

  interruptRecognizer.onerror = (e) => {
    if (e.error === 'no-speech') {
      // 没说话，继续监听
      if (voiceActive && !ttsAborted && interruptRecognizer) {
        try { interruptRecognizer.start(); } catch {}
      }
    }
  };

  try { interruptRecognizer.start(); } catch {}
}

function stopInterruptDetector() {
  if (interruptRecognizer) {
    try { interruptRecognizer.abort(); } catch {}
    interruptRecognizer = null;
  }
}

// 兼容旧接口（打字模式 + fallback）
async function speakText(text) {
  if (!voiceActive || ttsAborted) return;
  const clean = cleanTtsText(text);
  voiceBtn.classList.add('voice-speaking');

  let played = false;
  try {
    const blob = await fetchTtsBlob(clean);
    if (blob && !ttsAborted) {
      await playTtsBlob(blob);
      played = true;
    }
  } catch {}

  if (!played && voiceActive && !ttsAborted) {
    await new Promise(r => {
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = 'zh-CN';
      utter.rate = 1.0;
      utter.volume = 1.0;
      utter.onend = () => r();
      utter.onerror = () => r();
      window.speechSynthesis.speak(utter);
    });
  }

  voiceBtn.classList.remove('voice-speaking');
}

// ── 语音输入处理（可被 interrupt 复用）────────────────

async function handleSpeechInput(text) {
  if (!text) return;
  appendBubble('user', text);

  const aiBubble = createStreamingBubble();

  const ttsQueue = [];
  currentTtsQueue = ttsQueue;
  ttsAborted = false;
  let ttsProcessing = false;

  async function drainTtsQueue() {
    if (ttsProcessing) return;
    ttsProcessing = true;

    // TTS 开始播放后，启动打断检测
    startInterruptDetector(handleSpeechInput);

    let prefetchedBlob = null;

    while (ttsQueue.length > 0 && voiceActive && !ttsAborted) {
      const sentence = ttsQueue.shift();

      const nextFetch = ttsQueue.length > 0
        ? fetchTtsBlob(ttsQueue[0])
        : Promise.resolve(null);

      if (prefetchedBlob) {
        await playTtsBlob(prefetchedBlob);
      } else {
        const blob = await fetchTtsBlob(sentence);
        if (blob && !ttsAborted) await playTtsBlob(blob);
      }

      // 句子间固定 30ms
      if (voiceActive && !ttsAborted && ttsQueue.length > 0) {
        await new Promise(r => setTimeout(r, 30));
      }

      prefetchedBlob = await nextFetch;
    }

    stopInterruptDetector();
    if (prefetchedBlob && !ttsAborted && voiceActive) {
      await playTtsBlob(prefetchedBlob);
    }
    currentTtsQueue = null;
    ttsProcessing = false;
  }

  function enqueueTts(sentence) {
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

    if (ttsAborted) return; // 用户已打断，不覆盖气泡

    finalizeStreamingBubble(aiBubble, fullReply);
    if (window.notifyDaughter) notifyDaughter(text, fullReply);
    saveLog(text, fullReply);

    while ((ttsQueue.length > 0 || ttsProcessing) && voiceActive && !ttsAborted) {
      await new Promise(r => setTimeout(r, 200));
    }
    stopInterruptDetector();
    if (voiceActive && !ttsAborted) startRecognition();
  } catch (e) {
    console.error('Stacy 请求失败:', e);
    if (!ttsAborted) {
      removeStreamingBubble(aiBubble);
      appendBubble('ai', '网络有点问题，稍后再试一下 🌙');
    }
    saveLog(text, '');
    stopInterruptDetector();
    if (voiceActive) startRecognition();
  }
}

// ── 语音识别 ─────────────────────────────────

function startRecognition() {
  console.log('[STT] startRecognition 被调用');
  if (!SpeechRecognition) {
    console.log('[STT] SpeechRecognition 不支持');
    appendBubble('ai', '当前浏览器不支持语音，请用 Chrome 打开 🌙');
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = async (event) => {
    console.log('[STT] 识别结果:', event.results[0][0].transcript);
    const text = event.results[0][0].transcript.trim();
    if (!text) return;

    // 打断当前 TTS
    abortAllTts();

    handleSpeechInput(text);
  };

  recognition.onerror = (e) => {
    console.warn('[STT] 错误:', e.error, e.message);
    if (e.error === 'no-speech' && voiceActive) {
      startRecognition();
    } else if (e.error === 'aborted') {
      // 用户手动停了
    } else {
      appendBubble('ai', '语音识别出了点问题，可以打字试试 🌙');
      stopVoice();
    }
  };

  recognition.start();
}

function stopVoice() {
  voiceActive = false;
  abortAllTts();
  stopInterruptDetector();
  if (recognition) { recognition.abort(); recognition = null; }
  voiceBtn.classList.remove('voice-active', 'voice-speaking');
}

voiceBtn.addEventListener('click', async () => {
  if (voiceActive) {
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
  voiceBtn.classList.add('voice-active');
  appendBubble('ai', '语音已接通，请说话吧 🌙');
  console.log('[VOICE] 点击麦克风，准备开始识别');
  startRecognition();
  console.log('[VOICE] startRecognition 已调用');
});
