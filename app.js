// Stacy Moon — App Logic (WebSocket Voice Edition)

// ── Voice Bot 服务地址 ────────────────────────────
// 生产环境：http://43.128.150.218:8002
// 本地开发：http://localhost:8002
const VOICE_API_URL = 'http://43.128.150.218:8002';

// ═══════════════════════════════════════════════════════════
// ─ 文字聊天（保持不变）────────────────────────────
// ═══════════════════════════════════════════════════════════

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  appendBubble('user', text);
  input.value = '';

  const loadingId = appendLoading();

  try {
    const aiBubble = createStreamingBubble();
    const reply = await askStacyStream(text,
      null,  // 文字聊天不需要 TTS 句子回调
      (char) => {
        updateStreamingBubble(aiBubble, 
          aiBubble._streamText = (aiBubble._streamText || '') + char);
      }
    );
    removeLoading(loadingId);
    finalizeStreamingBubble(aiBubble, reply);
    if (window.notifyDaughter) notifyDaughter(text, reply);
    saveLog(text, reply);
  } catch (e) {
    console.error('Stacy 请求失败:', e);
    removeLoading(loadingId);
    removeStreamingBubble(aiBubble);
    showRetryBubble(text);
  }
}

async function retryAi() {
  const text = lastUserMessage;
  if (!text) return;
  removeRetryBubble();
  const loadingId = appendLoading();
  try {
    const aiBubble = createStreamingBubble();
    const reply = await askStacyStream(text,
      null,
      (char) => {
        updateStreamingBubble(aiBubble,
          aiBubble._streamText = (aiBubble._streamText || '') + char);
      }
    );
    removeLoading(loadingId);
    finalizeStreamingBubble(aiBubble, reply);
    if (window.notifyDaughter) notifyDaughter(text, reply);
    saveLog(text, reply);
  } catch (e) {
    console.error('重试失败:', e);
    removeLoading(loadingId);
    showRetryBubble(text);
  }
}

let retryBubbleEl = null;

function showRetryBubble(userMessage) {
  lastUserMessage = userMessage;
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ai';
  div.id = 'retry-bubble';
  div.innerHTML = `
    <span class="avatar">🌙</span>
    <div class="bubble ai-bubble">
      网络有点问题，稍后再试一下 
      <div class="retry-actions">
        <button class="retry-btn retry-primary" onclick="retryAi()">重试</button>
        <button class="retry-btn" onclick="removeRetryBubble()">算了</button>
      </div>
    </div>
  `;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  retryBubbleEl = div;
}

function removeRetryBubble() {
  const el = document.getElementById('retry-bubble');
  if (el) el.remove();
  if (retryBubbleEl) retryBubbleEl.remove();
  retryBubbleEl = null;
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
  div.innerHTML = `<span class="avatar breathing">🌙</span><div class="bubble ai-bubble typing-bubble">Stacy 正在想... <span class="typing-dots"><span>●</span><span>●</span><span>●</span></span><div class="slow-hint" id="slow-hint-${id}">网络有点慢，再等一下～</div></div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  const tid = setTimeout(() => {
    const hint = document.getElementById('slow-hint-' + id);
    if (hint) hint.classList.add('show');
  }, 10000);
  div._slowTimer = tid;

  return id;
}

function removeLoading(id) {
  const el = document.getElementById(id);
  if (el) {
    if (el._slowTimer) clearTimeout(el._slowTimer);
    el.remove();
  }
}

// ── 流式气泡 ───────────────────────────────
function createStreamingBubble() {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ai';
  div.innerHTML = '<span class="avatar breathing">🌙</span><div class="bubble ai-bubble typing-bubble">Stacy 正在想... <span class="typing-dots"><span>●</span><span>●</span><span>●</span></span></div>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  div._streamStarted = false;
  return div;
}

function updateStreamingBubble(el, text) {
  const bubble = el.querySelector('.ai-bubble');
  if (!el._streamStarted) {
    el._streamStarted = true;
    bubble.className = 'bubble ai-bubble';
    el.querySelector('.avatar')?.classList.remove('breathing');
  }
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

// ─ 声波动画（TTS 播放中）──
function showSoundwave() {
  // 找到最后一个 AI 气泡来显示声波动画
  const rows = document.querySelectorAll('.bubble-row.ai .ai-bubble');
  const bubble = rows.length > 0 ? rows[rows.length - 1] : null;
  if (bubble && !bubble.querySelector('.soundwave')) {
    bubble.insertAdjacentHTML('beforeend', '<span class="soundwave show"><span class="soundwave-bar"></span><span class="soundwave-bar"></span><span class="soundwave-bar"></span><span class="soundwave-bar"></span></span>');
  }
  document.getElementById('listening-hint')?.classList.add('show');
  document.querySelector('.input-area')?.classList.add('waiting');
}

function hideSoundwave() {
  document.querySelectorAll('.soundwave').forEach(el => el.classList.remove('show'));
  document.getElementById('listening-hint')?.classList.remove('show');
  document.querySelector('.input-area')?.classList.remove('waiting');
}

// ── 事件绑定 ─────────────────────────────────
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// ═══════════════════════════════════════════════════════════
// ── 语音对话（WebSocket + Pipecat 管道）───────────
// ═══════════════════════════════════════════════════════════

const voiceBtn = document.getElementById('voice-btn');
const voiceIcon = document.getElementById('voice-icon');

let voiceActive = false;        // 是否在语音通话中
let isSpeaking = false;         // bot 是否正在说话（TTS 播放中）
let lastUserMessage = '';
let voiceWs = null;             // 音频 WebSocket
let micStream = null;           // 麦克风 MediaStream
let micAudioCtx = null;         // 麦克风 AudioContext
let micProcessor = null;        // ScriptProcessorNode
let audioPlayer = null;         // 音频播放器
let micMuted = false;           // 麦克风静音
let voiceStatusText = '';       // 当前状态文案

// ── 按钮图标 ────────────────────────────────
const MIC_ICON = `<path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`;
const STOP_ICON = `<rect x="6" y1="6" width="12" height="12" rx="2"/>`;

function setVoiceIcon(type) {
  if (!voiceIcon) return;
  voiceIcon.innerHTML = type === 'stop' ? STOP_ICON : MIC_ICON;
}

// ── 音频播放器（顺序播放 bot 的 WAV 块）────────
class BotAudioPlayer {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.nextTime = 0;
    this.onSpeakingStart = null;
    this.onSpeakingEnd = null;
    this._speakTimer = null;
  }

  async enqueue(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return;
    try {
      const buf = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      const start = Math.max(now, this.nextTime);
      src.start(start);
      this.nextTime = start + buf.duration;

      // 标记 bot 正在说话
      if (this.onSpeakingStart) this.onSpeakingStart();

      // 播完后延迟标记停止
      if (this._speakTimer) clearTimeout(this._speakTimer);
      this._speakTimer = setTimeout(() => {
        this.nextTime = 0;
        if (this.onSpeakingEnd) this.onSpeakingEnd();
      }, (this.nextTime - now) * 1000 + 300);

      src.onended = () => {};
    } catch (e) {
      // 空块或无效 WAV 忽略
    }
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  stop() {
    this.nextTime = 0;
    if (this._speakTimer) { clearTimeout(this._speakTimer); this._speakTimer = null; }
    if (this.onSpeakingEnd) this.onSpeakingEnd();
  }

  close() {
    this.stop();
    try { this.ctx.close(); } catch {}
  }
}

// ── 麦克风 → WebSocket（PCM 16kHz 16-bit mono）───
async function startMic(ws) {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  });

  micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const actualRate = micAudioCtx.sampleRate;
  const targetRate = 16000;
  const ratio = actualRate / targetRate;

  const source = micAudioCtx.createMediaStreamSource(micStream);
  micProcessor = micAudioCtx.createScriptProcessor(4096, 1, 1);

  micProcessor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || micMuted) return;
    const input = e.inputBuffer.getChannelData(0);
    const outLen = Math.floor(input.length / ratio);
    const pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const s = input[Math.floor(i * ratio)];
      pcm[i] = Math.max(-32768, Math.min(32767, s * 32767));
    }
    ws.send(pcm.buffer);
  };

  source.connect(micProcessor);
  micProcessor.connect(micAudioCtx.destination);
  console.log('[VOICE] 麦克风已启动，原始', actualRate, 'Hz → 16kHz');
}

function stopMic() {
  if (micProcessor) { try { micProcessor.disconnect(); } catch {} micProcessor = null; }
  if (micAudioCtx)  { try { micAudioCtx.close(); } catch {} micAudioCtx = null; }
  if (micStream)    { micStream.getTracks().forEach(t => { try { t.stop(); } catch {} }); micStream = null; }
}

// ── WebSocket 连接（带重试）──────────────────────
async function connectVoiceWs(wsUrl, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log('[VOICE] 连接 WebSocket（第', i + 1, '次）');
      const conn = await new Promise((resolve, reject) => {
        const sock = new WebSocket(wsUrl);
        sock.binaryType = 'arraybuffer';
        const timer = setTimeout(() => reject(new Error('连接超时')), 5000);
        sock.onopen = () => { clearTimeout(timer); resolve(sock); };
        sock.onerror = (e) => { clearTimeout(timer); reject(new Error('连接失败')); };
      });
      return conn;
    } catch (e) {
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw e;
      }
    }
  }
}

// ── 开始语音通话 ─────────────────────────────────
async function startVoiceCall() {
  const profile = JSON.parse(localStorage.getItem('stacy_profile') || '{}');
  const todayLogs = JSON.parse(localStorage.getItem('stacy_daily_logs') || '[]');
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLog = todayLogs.find(l => l.date === todayStr) || {};

  voiceActive = true;
  voiceBtn.classList.add('voice-active');
  setVoiceIcon('stop');
  appendBubble('ai', '好的，请说话 🌙');

  try {
    // 1. 请求后端启动 bot，获取 WebSocket 地址
    console.log('[VOICE] POST /session …');
    const res = await fetch(`${VOICE_API_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_context: {
          profile: profile,
          today_log: todayLog
        }
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const { ws_url } = await res.json();
    console.log('[VOICE] bot 已启动，ws_url =', ws_url);

    // 2. 解锁 AudioContext（iOS 需要用户手势）
    audioPlayer = new BotAudioPlayer();
    audioPlayer.resume();

    // 3. 连接音频 WebSocket（带重试）
    voiceWs = await connectVoiceWs(ws_url);
    console.log('[VOICE] WebSocket 已连接');

    // 4. 接收 bot 音频
    voiceWs.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer && e.data.byteLength > 0) {
        audioPlayer.enqueue(e.data);
        isSpeaking = true;
        showSoundwave();
      }
    };

    voiceWs.onclose = () => {
      console.log('[VOICE] WebSocket 已关闭');
      if (voiceActive) endVoiceCall();
    };

    voiceWs.onerror = () => {
      console.error('[VOICE] WebSocket 错误');
      if (voiceActive) endVoiceCall();
    };

    // 5. 打开麦克风，开始发送音频
    await startMic(voiceWs);
    console.log('[VOICE] 通话已建立');

  } catch (e) {
    console.error('[VOICE] 启动失败:', e);
    appendBubble('ai', '语音连接失败，请稍后再试 🌙');
    endVoiceCall();
  }
}

// ── 结束语音通话 ─────────────────────────────────
function endVoiceCall() {
  voiceActive = false;
  isSpeaking = false;
  micMuted = false;

  stopMic();
  if (voiceWs) { try { voiceWs.close(); } catch {} voiceWs = null; }
  if (audioPlayer) { audioPlayer.close(); audioPlayer = null; }

  voiceBtn.classList.remove('voice-active', 'voice-speaking');
  setVoiceIcon('mic');
  hideSoundwave();

  console.log('[VOICE] 通话已结束');
}

// ── 麦克风按钮点击 ───────────────────────────────
voiceBtn.addEventListener('click', async () => {
  // iOS AudioContext 解锁
  if (!audioPlayer) {
    audioPlayer = new BotAudioPlayer();
    await audioPlayer.resume();
  } else if (audioPlayer.ctx.state === 'suspended') {
    await audioPlayer.resume();
  }

  console.log('[VOICE] 点击, voiceActive:', voiceActive);

  if (!voiceActive) {
    // 关闭 → 开启
    await startVoiceCall();
  } else {
    // 开启 → 关闭
    appendBubble('ai', '好的，下次再聊 🌙');
    endVoiceCall();
  }
});

// ── 麦克风静音切换（可选功能）───────────────────
function toggleMicMute() {
  micMuted = !micMuted;
  console.log('[VOICE] 麦克风静音:', micMuted);
}
