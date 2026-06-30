'use strict';

// Stacy Moon — App Logic (WebSocket Voice Edition)

// ── Voice Bot 服务地址 ────────────────────────────
const VOICE_API_URL = 'https://stacymoon.online/voice/session';

// ═══════════════════════════════════════════════════════════
// ─ 文字聊天（保持不变）────────────────────────────
// ═══════════════════════════════════════════════════════════

const sendMessage = async () => {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  appendBubble('user', text);
  input.value = '';

  const aiBubble = createStreamingBubble();

  try {
    const reply = await askStacyStream(text,
      null,  // 文字聊天不需要 TTS 句子回调
      (char) => {
        updateStreamingBubble(aiBubble,
          aiBubble._streamText = (aiBubble._streamText || '') + char);
      }
    );
    finalizeStreamingBubble(aiBubble, reply);
    if (window.notifyDaughter) notifyDaughter(text, reply);
    saveLog(text, reply);
    document.querySelector('.header').classList.add('compact');
  } catch (e) {
    console.error('Stacy 请求失败:', e);
    removeStreamingBubble(aiBubble);
    showRetryBubble(text);
  }
};

const retryAi = async () => {
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
};

let retryBubbleEl = null;

const showRetryBubble = (userMessage) => {
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
};

const removeRetryBubble = () => {
  const el = document.getElementById('retry-bubble');
  if (el) el.remove();
  if (retryBubbleEl) retryBubbleEl.remove();
  retryBubbleEl = null;
};

const saveLog = async (userMessage, aiReply) => {
  const now = new Date();
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  const logs = JSON.parse(localStorage.getItem('stacy_logs') || '[]');
  logs.push({ time: timeStr, created_at: dateStr, userMessage, aiReply });
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
};

const appendBubble = (role, text) => {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ' + role;
  div.innerHTML = role === 'ai'
    ? `<span class="avatar">🌙</span><div class="bubble ai-bubble">${text}</div>`
    : `<div class="bubble user-bubble">${text}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
};

let loadingCounter = 0;
const appendLoading = () => {
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
};

const removeLoading = (id) => {
  const el = document.getElementById(id);
  if (el) {
    if (el._slowTimer) clearTimeout(el._slowTimer);
    el.remove();
  }
};

// ── 流式气泡 ───────────────────────────────
const createStreamingBubble = () => {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ai';
  div.innerHTML = '<span class="avatar breathing">🌙</span><div class="bubble ai-bubble typing-bubble">Stacy 正在想... <span class="typing-dots"><span>●</span><span>●</span><span>●</span></span></div>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  div._streamStarted = false;
  return div;
};

const updateStreamingBubble = (el, text) => {
  const bubble = el.querySelector('.ai-bubble');
  if (!el._streamStarted) {
    el._streamStarted = true;
    bubble.className = 'bubble ai-bubble';
    el.querySelector('.avatar')?.classList.remove('breathing');
  }
  if (bubble) bubble.textContent = text;
  const box = document.getElementById('chat-box');
  box.scrollTop = box.scrollHeight;
};

const finalizeStreamingBubble = (el, text) => {
  const bubble = el.querySelector('.ai-bubble');
  if (bubble) bubble.textContent = text;
};

const removeStreamingBubble = (el) => {
  if (el) el.remove();
};

// ─ 声波动画（TTS 播放中）──
const showSoundwave = () => {
  // 找到最后一个 AI 气泡来显示声波动画
  const rows = document.querySelectorAll('.bubble-row.ai .ai-bubble');
  const bubble = rows.length > 0 ? rows[rows.length - 1] : null;
  if (bubble && !bubble.querySelector('.soundwave')) {
    bubble.insertAdjacentHTML('beforeend', '<span class="soundwave show"><span class="soundwave-bar"></span><span class="soundwave-bar"></span><span class="soundwave-bar"></span><span class="soundwave-bar"></span></span>');
  }
  document.getElementById('listening-hint')?.classList.add('show');
  document.querySelector('.input-area')?.classList.add('waiting');
};

const hideSoundwave = () => {
  document.querySelectorAll('.soundwave').forEach(el => el.classList.remove('show'));
  document.getElementById('listening-hint')?.classList.remove('show');
  document.querySelector('.input-area')?.classList.remove('waiting');
};

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
let voiceStarting = false;      // 防止启动过程中重复点击/重复连接
let voiceCallId = 0;            // 区分旧 WebSocket 事件和当前通话
let isSpeaking = false;         // bot 是否正在说话（TTS 播放中）
let lastUserMessage = '';
let voiceWs = null;             // 音频 WebSocket
let micStream = null;           // 麦克风 MediaStream
let micAudioCtx = null;         // 麦克风 AudioContext
let micWorkletNode = null;      // AudioWorkletNode
let audioPlayer = null;         // 音频播放器
let micMuted = false;           // 麦克风静音
let voiceStatusText = '';       // 当前状态文案

// ── 按钮图标 ────────────────────────────────
const MIC_ICON = `<path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`;
const PHONE_ICON = `<rect x="6" y="6" width="12" height="12" rx="2"/>`;

const setVoiceIcon = (type) => {
  if (!voiceIcon) return;
  voiceIcon.innerHTML = type === 'phone' ? PHONE_ICON : MIC_ICON;
};

// ── 音频播放器（AudioWorklet 连续播放 bot 的 PCM 流）────────
class BotAudioPlayer {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.node = null;
    this.onSpeakingStart = null;
    this.onSpeakingEnd = null;
    this._speakTimer = null;
    this._ready = null;
    this._chunkCount = 0;
    this._playUntilMs = 0;
    this._sourceRate = 44100;
  }

  enqueue(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return;
    const chunk = arrayBuffer.slice(0);
    this.init()
      .then(() => this._enqueuePcm(chunk))
      .catch(e => console.warn('[VOICE] 音频播放队列错误:', e));
  }

  async init() {
    if (this._ready) return this._ready;

    this._ready = (async () => {
      await this.resume();
      await this.ctx.audioWorklet.addModule('worklet.js?v=11');
      this.node = new AudioWorkletNode(this.ctx, 'pcm-stream-player', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          sourceRate: this._sourceRate,
          initialBufferSec: 0.45,
          rebufferSec: 0.16,
          maxBufferSec: 12
        }
      });
      this.node.port.onmessage = (event) => {
        if (event.data?.type === 'started') {
          if (this.onSpeakingStart) this.onSpeakingStart();
        } else if (event.data?.type === 'underrun') {
          console.warn('[VOICE] bot PCM 播放 underrun 次数=', event.data.count);
        }
      };
      this.node.connect(this.ctx.destination);
    })();

    return this._ready;
  }

  _enqueuePcm(arrayBuffer) {
    this.node.port.postMessage({ type: 'pcm', buffer: arrayBuffer }, [arrayBuffer]);

    this._chunkCount++;
    if (this._chunkCount === 1) {
      console.log('[VOICE] 收到并开始缓冲 bot PCM 音频 首块字节=', arrayBuffer.byteLength);
    }

    const now = performance.now();
    const durationMs = (arrayBuffer.byteLength / 2 / this._sourceRate) * 1000;
    this._playUntilMs = Math.max(this._playUntilMs, now + 350) + durationMs;

    if (this.onSpeakingStart) this.onSpeakingStart();
    if (this._speakTimer) clearTimeout(this._speakTimer);
    this._speakTimer = setTimeout(() => {
      this._playUntilMs = 0;
      if (this.onSpeakingEnd) this.onSpeakingEnd();
    }, Math.max(500, this._playUntilMs - now + 700));
  }

  resume() {
    if (this.ctx.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  stop() {
    this._playUntilMs = 0;
    this._chunkCount = 0;
    if (this._speakTimer) { clearTimeout(this._speakTimer); this._speakTimer = null; }
    if (this.node) {
      try { this.node.disconnect(); } catch {}
      this.node = null;
    }
    this._ready = null;
    if (this.onSpeakingEnd) this.onSpeakingEnd();
  }

  close() {
    this.stop();
    try { this.ctx.close(); } catch {}
  }
}

// ── 麦克风 → WebSocket（PCM 16kHz 16-bit mono，AudioWorklet）───
const startMic = async (ws) => {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: { ideal: 1 },
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: false
    }
  });

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  micAudioCtx = audioCtx;

  if (audioCtx.state === 'suspended') await audioCtx.resume();
  console.log('[VOICE] audioCtx.state=', audioCtx.state, 'sampleRate=', audioCtx.sampleRate);

  // 加载 AudioWorklet 模块（替代废弃的 ScriptProcessorNode）
  await audioCtx.audioWorklet.addModule('worklet.js?v=11');

  const source = audioCtx.createMediaStreamSource(micStream);
  const workletNode = new AudioWorkletNode(audioCtx, 'pcm-resampler', {
    processorOptions: {
      targetRate: 16000,
      voiceThreshold: 0.003
    }
  });
  micWorkletNode = workletNode;

  let pcmSent = false;

  workletNode.port.onmessage = (e) => {
    // __debug 消息：1% 采样诊断，确认原始音频是否有数据
    if (e.data && e.data.__debug) {
      console.log('[WORKLET DEBUG] len=', e.data.len, 'peak=', e.data.peak);
      return;
    }
    // 调试消息：worklet 发来的诊断数据
    if (e.data && e.data.debug) {
      console.log('[VOICE] worklet 第', e.data.callCount, '次',
        '声道=', e.data.numChannels,
        'bufLen=', e.data.bufLen,
        'floatPeak=', e.data.floatPeak,
        'floatAvg=', e.data.floatAvg);
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN || micMuted) {
      if (!pcmSent) console.log('[VOICE] PCM 跳过: wsReadyState=', ws?.readyState, 'micMuted=', micMuted);
      return;
    }
    // e.data 是 Int16Array 的 ArrayBuffer（已通过 transfer 传递）
    if (isSpeaking) return;
    ws.send(e.data);
    if (!pcmSent) {
      pcmSent = true;
      const pcm = new Int16Array(e.data);
      let peak = 0;
      for (let i = 0; i < Math.min(pcm.length, 200); i++) {
        const a = Math.abs(pcm[i]); if (a > peak) peak = a;
      }
      console.log('[VOICE] PCM 开始发送 样本数=', pcm.length, '峰值=', peak);
    }
  };

  source.connect(workletNode);
  // 用静音 GainNode 维持音频链路活跃，但不产生回声
  const muteGain = audioCtx.createGain();
  muteGain.gain.value = 0;
  workletNode.connect(muteGain);
  muteGain.connect(audioCtx.destination);

  console.log('[VOICE] 麦克风已启动 AudioWorklet 原始', audioCtx.sampleRate, 'Hz → 16kHz');
};

const stopMic = () => {
  if (micWorkletNode) { try { micWorkletNode.disconnect(); } catch {} micWorkletNode = null; }
  if (micAudioCtx)   { try { micAudioCtx.close(); } catch {} micAudioCtx = null; }
  if (micStream)     { micStream.getTracks().forEach(t => { try { t.stop(); } catch {} }); micStream = null; }
};

// ── WebSocket 连接（带重试）──────────────────────
const connectVoiceWs = async (wsUrl, maxRetries = 5) => {
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
};

// ── 开始语音通话 ─────────────────────────────────
const startVoiceCall = async () => {
  if (voiceActive || voiceStarting) {
    console.log('[VOICE] 已在启动/通话中，忽略重复启动');
    return;
  }

  const profile = JSON.parse(localStorage.getItem('stacy_profile') || '{}');
  const todayLogs = JSON.parse(localStorage.getItem('stacy_daily_logs') || '[]');
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLog = todayLogs.find(l => l.date === todayStr) || {};
  const callId = ++voiceCallId;

  voiceStarting = true;
  voiceActive = true;
  voiceBtn.classList.add('voice-active');
  setVoiceIcon('phone');
  appendBubble('ai', '好的，请说话 🌙');

  try {
    // 1. 请求后端启动 bot，获取 WebSocket 地址
    console.log('[VOICE] POST /session …');
    const res = await fetch(VOICE_API_URL, {
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

    // 2. 复用点击时已解锁的 AudioContext（iOS 需要用户手势）
    if (!audioPlayer || audioPlayer.ctx.state === 'closed') {
      audioPlayer = new BotAudioPlayer();
    }
    audioPlayer.onSpeakingStart = () => {
      isSpeaking = true;
      showSoundwave();
    };
    audioPlayer.onSpeakingEnd = () => {
      isSpeaking = false;
      hideSoundwave();
    };
    await audioPlayer.resume();

    // 3. 连接音频 WebSocket（带重试）
    const ws = await connectVoiceWs(ws_url);
    if (callId !== voiceCallId || !voiceActive) {
      try { ws.close(); } catch {}
      return;
    }

    voiceWs = ws;
    console.log('[VOICE] WebSocket 已连接');

    // 4. 接收 bot 音频
    voiceWs.onmessage = (e) => {
      if (callId !== voiceCallId) return;
      if (e.data instanceof ArrayBuffer && e.data.byteLength > 0) {
        audioPlayer.enqueue(e.data);
      }
    };

    voiceWs.onclose = () => {
      console.log('[VOICE] WebSocket 已关闭');
      if (callId === voiceCallId && voiceActive) endVoiceCall();
    };

    voiceWs.onerror = () => {
      console.error('[VOICE] WebSocket 错误');
      if (callId === voiceCallId && voiceActive) endVoiceCall();
    };

    // 5. 打开麦克风，开始发送音频
    await startMic(voiceWs);
    if (callId !== voiceCallId || !voiceActive) return;
    console.log('[VOICE] 通话已建立');

  } catch (e) {
    console.error('[VOICE] 启动失败:', e);
    appendBubble('ai', '语音连接失败，请稍后再试 🌙');
    endVoiceCall();
  } finally {
    if (callId === voiceCallId) voiceStarting = false;
  }
};

// ── 结束语音通话 ─────────────────────────────────
const endVoiceCall = () => {
  voiceCallId++;
  voiceStarting = false;
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
};

// ── 麦克风按钮点击 ───────────────────────────────
voiceBtn.addEventListener('click', async () => {
  if (voiceStarting) {
    console.log('[VOICE] 正在启动，忽略重复点击');
    return;
  }

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
const toggleMicMute = () => {
  micMuted = !micMuted;
  console.log('[VOICE] 麦克风静音:', micMuted);
};

const escHtml = (s) => {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
};

// ── 页面初始化：恢复今天的历史记录或显示问候语 ──
(() => {
  const box = document.getElementById('chat-box');
  if (!box) return;

  const today = new Date();
  const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

  let logs = [];
  try { logs = JSON.parse(localStorage.getItem('stacy_logs') || '[]'); } catch {}

  const todayLogs = logs.filter(l => l.created_at === todayStr);

  if (todayLogs.length === 0) {
    // 今天没有任何记录 — 保持 HTML 里的欢迎气泡，只更新文案，不做其他操作
    // 文案已由 index.html 内嵌 script 处理
    return;
  }

  // 有今天的记录 — 清空欢迎气泡，按时间顺序渲染历史消息
  box.innerHTML = '';
  todayLogs.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  todayLogs.forEach(l => {
    const userMsg = l.userMessage || l.user_message || '';
    const aiMsg = l.aiReply || l.ai_reply || '';

    if (userMsg) {
      const userDiv = document.createElement('div');
      userDiv.className = 'bubble-row user';
      userDiv.innerHTML = '<div class="bubble user-bubble">' + escHtml(userMsg) + '</div>';
      box.appendChild(userDiv);
    }
    if (aiMsg) {
      const aiDiv = document.createElement('div');
      aiDiv.className = 'bubble-row ai';
      aiDiv.innerHTML = '<span class="avatar">🌙</span><div class="bubble ai-bubble">' + escHtml(aiMsg) + '</div>';
      box.appendChild(aiDiv);
    }
  });

  // 恢复后 header 保持 compact 状态
  const header = document.querySelector('.header');
  if (header) header.classList.add('compact');

  box.scrollTop = box.scrollHeight;
})();
