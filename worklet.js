// Stacy Moon — AudioWorklet: PCM 16kHz 降采样处理器
// 替代已废弃的 ScriptProcessorNode

class PcmResampler extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.targetRate = options.processorOptions?.targetRate || 16000;
    this.inputRate = sampleRate;
    this.ratio = this.inputRate / this.targetRate;
    this.callCount = 0;
  }

  process(inputs) {
    this.callCount++;

    const input = inputs[0];
    if (!input || !input.length) return true;
    // 取第一个声道（即使设备给立体声，也用左声道）
    const channel0 = input[0];
    if (!channel0) return true;
    const bufLen = channel0.length;

    // 1% 概率打印原始音频数据，确认麦克风是否有真实输入
    if (Math.random() < 0.01) {
      let peak = 0;
      for (let i = 0; i < bufLen; i++) {
        const a = Math.abs(channel0[i]);
        if (a > peak) peak = a;
      }
      this.port.postMessage({ __debug: true, len: bufLen, peak: peak });
    }

    // 前 10 次发调试消息
    if (this.callCount <= 10) {
      let peak = 0, sum = 0;
      for (let i = 0; i < bufLen; i++) {
        const a = Math.abs(channel0[i]);
        if (a > peak) peak = a;
        sum += a;
      }
      this.port.postMessage({
        debug: true,
        callCount: this.callCount,
        inputRate: this.inputRate,
        numChannels: input.length,
        bufLen: bufLen,
        floatPeak: peak.toFixed(6),
        floatAvg: (bufLen > 0 ? sum / bufLen : 0).toFixed(6)
      });
    }

    if (bufLen < 1) return true;

    const outLen = Math.floor(bufLen / this.ratio);
    if (outLen < 1) return true;

    const pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const s = channel0[Math.floor(i * this.ratio)];
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
    }

    // 把 PCM buffer 传回主线程
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor('pcm-resampler', PcmResampler);
