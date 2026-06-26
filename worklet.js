// Stacy Moon — AudioWorklet: PCM 16kHz 降采样处理器
// 替代已废弃的 ScriptProcessorNode

class PcmResampler extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.targetRate = options.processorOptions?.targetRate || 16000;
    this.inputRate = sampleRate;
    this.ratio = this.inputRate / this.targetRate;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0]) return true;

    const channel = input[0]; // Float32Array
    const outLen = Math.floor(channel.length / this.ratio);
    if (outLen < 1) return true;

    const pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const s = channel[Math.floor(i * this.ratio)];
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
    }

    // 把 PCM buffer 传回主线程（transfer 避免拷贝）
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor('pcm-resampler', PcmResampler);
