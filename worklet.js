// Stacy Moon — AudioWorklet: PCM 16kHz 降采样处理器
// 替代已废弃的 ScriptProcessorNode

class PcmResampler extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.targetRate = options.processorOptions?.targetRate || 16000;
    this.voiceThreshold = options.processorOptions?.voiceThreshold || 0.003;
    this.debug = options.processorOptions?.debug === true;
    this.inputRate = sampleRate;
    this.ratio = this.inputRate / this.targetRate;
    this.sourceOffset = 0;
    this.chunkSamples = Math.max(
      160,
      Math.floor(this.targetRate * ((options.processorOptions?.chunkMs || 20) / 1000))
    );
    this.chunk = new Int16Array(this.chunkSamples);
    this.chunkIndex = 0;
    this.callCount = 0;
  }

  _pushSample(sample) {
    this.chunk[this.chunkIndex++] = sample;
    if (this.chunkIndex < this.chunkSamples) return;

    const out = this.chunk;
    this.port.postMessage(out.buffer, [out.buffer]);
    this.chunk = new Int16Array(this.chunkSamples);
    this.chunkIndex = 0;
  }

  process(inputs) {
    this.callCount++;

    const input = inputs[0];
    if (!input || !input.length) return true;
    // 取第一个声道（即使设备给立体声，也用左声道）
    const channel0 = input[0];
    if (!channel0) return true;
    const bufLen = channel0.length;

    // 调试模式才向主线程发诊断消息，避免手机端音频线程被日志拖慢。
    if (this.debug && Math.random() < 0.01) {
      let peak = 0;
      for (let i = 0; i < bufLen; i++) {
        const a = Math.abs(channel0[i]);
        if (a > peak) peak = a;
      }
      this.port.postMessage({ __debug: true, len: bufLen, peak: peak });
    }

    // 前 10 次发调试消息
    if (this.debug && this.callCount <= 10) {
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

    let inputPeak = 0;
    for (let i = 0; i < bufLen; i++) {
      const a = Math.abs(channel0[i]);
      if (a > inputPeak) inputPeak = a;
    }
    const treatAsSilence = inputPeak < this.voiceThreshold;

    while (this.sourceOffset < bufLen) {
      let sample = 0;
      if (!treatAsSilence) {
        const s = channel0[Math.floor(this.sourceOffset)] || 0;
        sample = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
      }
      this._pushSample(sample);
      this.sourceOffset += this.ratio;
    }

    this.sourceOffset -= bufLen;
    return true;
  }
}

registerProcessor('pcm-resampler', PcmResampler);

class PcmStreamPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.sourceRate = options.processorOptions?.sourceRate || 44100;
    this.initialBufferFrames = Math.floor(
      (options.processorOptions?.initialBufferSec || 0.45) * sampleRate
    );
    this.rebufferFrames = Math.floor(
      (options.processorOptions?.rebufferSec || 0.16) * sampleRate
    );
    this.maxBufferFrames = Math.floor(
      (options.processorOptions?.maxBufferSec || 12) * sampleRate
    );
    this.queue = [];
    this.readIndex = 0;
    this.queuedFrames = 0;
    this.started = false;
    this.hasStartedOnce = false;
    this.underrunActive = false;
    this.underruns = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data || data.type !== 'pcm' || !data.buffer) return;
      const pcm = this._extractPcm(data.buffer);
      if (!pcm || pcm.length === 0) return;
      const audio = this._resamplePcm16(pcm);
      if (audio.length === 0) return;

      this.queue.push(audio);
      this.queuedFrames += audio.length;
      this._trimOverflow();
    };
  }

  _extractPcm(buffer) {
    const bytes = new Uint8Array(buffer);
    if (
      bytes.length > 44 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 &&
      bytes[2] === 0x46 && bytes[3] === 0x46
    ) {
      let offset = 12;
      while (offset + 8 <= bytes.length) {
        const id =
          String.fromCharCode(bytes[offset]) +
          String.fromCharCode(bytes[offset + 1]) +
          String.fromCharCode(bytes[offset + 2]) +
          String.fromCharCode(bytes[offset + 3]);
        const size =
          bytes[offset + 4] |
          (bytes[offset + 5] << 8) |
          (bytes[offset + 6] << 16) |
          (bytes[offset + 7] << 24);
        if (id === 'data') {
          const start = offset + 8;
          const end = Math.min(start + size, bytes.length);
          return new Int16Array(buffer.slice(start, end));
        }
        offset += 8 + size + (size % 2);
      }
      return null;
    }
    return new Int16Array(buffer);
  }

  _resamplePcm16(pcm) {
    const ratio = this.sourceRate / sampleRate;
    const outLen = Math.max(0, Math.floor(pcm.length / ratio));
    const out = new Float32Array(outLen);

    for (let i = 0; i < outLen; i++) {
      const srcPos = i * ratio;
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;
      const a = pcm[idx] || 0;
      const b = pcm[Math.min(idx + 1, pcm.length - 1)] || a;
      out[i] = (a + (b - a) * frac) / 32768;
    }

    return out;
  }

  _trimOverflow() {
    while (this.queuedFrames > this.maxBufferFrames && this.queue.length > 1) {
      const dropped = this.queue.shift();
      this.queuedFrames -= dropped.length;
      this.readIndex = 0;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output.length) return true;
    const left = output[0];
    const right = output[1];

    if (!this.started) {
      const neededFrames = this.hasStartedOnce ? this.rebufferFrames : this.initialBufferFrames;
      if (this.queuedFrames < neededFrames) {
        left.fill(0);
        if (right) right.fill(0);
        return true;
      }
      this.started = true;
      this.hasStartedOnce = true;
      this.underrunActive = false;
      this.port.postMessage({ type: 'started' });
    }

    for (let i = 0; i < left.length; i++) {
      if (!this.queue.length) {
        left[i] = 0;
        if (right) right[i] = 0;
        this.started = false;
        if (!this.underrunActive) {
          this.underrunActive = true;
          this.underruns++;
          this.port.postMessage({ type: 'underrun', count: this.underruns });
        }
        continue;
      }

      const chunk = this.queue[0];
      const sample = chunk[this.readIndex++] || 0;
      left[i] = sample;
      if (right) right[i] = sample;
      this.queuedFrames--;

      if (this.readIndex >= chunk.length) {
        this.queue.shift();
        this.readIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-stream-player', PcmStreamPlayer);
