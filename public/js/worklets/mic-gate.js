import { createRnnoiseState } from '/vendor/web-noise-suppressor/rnnoiseWorkletProcessor.js?v=2';

const SILENCE_DB = -90;
const VAD_ONSET = 0.58;
const VAD_SUSTAIN = 0.38;
const BYPASS_SPEAKING_DB = -55;

class MicGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.automatic = false;
    this.thresholdDb = null;
    this.muted = false;
    this.stopped = false;
    this.vad = null;
    this.vadFrame = new Float32Array(480); // RNNoise lê blocos de 10 ms a 48 kHz
    this.vadOffset = 0;
    this.probability = 0;
    // Guarda 20 ms para o começo da palavra chegar ao outro lado junto com a abertura.
    this.preRoll = new Float32Array(Math.round(sampleRate * 0.02));
    this.delayIndex = 0;
    this.attack = Math.exp(-1 / (sampleRate * 0.001));
    this.release = Math.exp(-1 / (sampleRate * 0.03));
    this.holdFrames = Math.round(sampleRate * 0.35);
    this.hold = 0;
    this.gain = 0;
    this.speaking = false;
    this.nextMeterFrame = 0;
    this.port.onmessage = ({ data }) => this.receive(data);
  }

  receive(message) {
    switch (message.type) {
      case 'config':
        if (this.automatic !== message.automatic) {
          this.hold = 0;
          this.vadOffset = 0;
          this.probability = 0;
        }
        this.automatic = message.automatic;
        this.thresholdDb = message.thresholdDb;
        break;
      case 'vad':
        createRnnoiseState(message.wasmBinary).then((state) => {
          if (this.stopped) state.destroy();
          else this.vad = state;
        }).catch(() => this.port.postMessage({ type: 'vad-error' }));
        break;
      case 'mute':
        this.muted = message.muted;
        if (this.muted) {
          this.preRoll.fill(0);
          this.gain = 0;
          this.hold = 0;
          this.vadOffset = 0;
          this.probability = 0;
        }
        break;
      case 'stop':
        this.stopped = true;
        this.vad?.destroy();
        this.vad = null;
        break;
    }
  }

  detectVoice(sidechain) {
    for (const sample of sidechain) {
      this.vadFrame[this.vadOffset++] = sample * 32767;
      if (this.vadOffset === this.vadFrame.length) {
        this.probability = this.vad.processFrame(this.vadFrame);
        this.vadOffset = 0;
      }
    }
    return this.probability >= (this.speaking ? VAD_SUSTAIN : VAD_ONSET);
  }

  process(inputs, outputs) {
    if (this.stopped) return false;
    const input = inputs[0][0];
    const sidechain = inputs[1][0];
    const output = outputs[0][0];
    let squareSum = 0;
    if (input) for (const sample of input) squareSum += sample * sample;
    const levelDb = Math.max(SILENCE_DB, 10 * Math.log10(squareSum / output.length));

    // Se o VAD ainda estiver carregando ou falhar, mantém o caminho de voz aberto.
    const useVad = this.automatic && !!this.vad && !!sidechain;
    const bypass = this.automatic ? !useVad : this.thresholdDb === null;
    let active = false;
    if (!this.muted) {
      if (useVad) {
        try {
          active = this.detectVoice(sidechain);
        } catch (_) {
          this.vad.destroy();
          this.vad = null;
          this.port.postMessage({ type: 'vad-error' });
        }
      } else {
        active = levelDb >= (bypass ? BYPASS_SPEAKING_DB : this.thresholdDb);
      }
    }
    this.hold = active ? this.holdFrames : Math.max(0, this.hold - output.length);
    const speaking = !this.muted && this.hold > 0;
    const open = !this.muted && (bypass || (this.automatic && !this.vad) || speaking);

    if (speaking !== this.speaking || currentFrame >= this.nextMeterFrame) {
      this.speaking = speaking;
      this.nextMeterFrame = currentFrame + Math.round(sampleRate * 0.05);
      this.port.postMessage({ type: 'meter', levelDb, speaking, open });
    }

    const target = open ? 1 : 0;
    const smoothing = open ? this.attack : this.release;
    for (let i = 0; i < output.length; i++) {
      const delayed = this.preRoll[this.delayIndex];
      this.preRoll[this.delayIndex] = input?.[i] || 0;
      this.delayIndex = (this.delayIndex + 1) % this.preRoll.length;
      this.gain = target + (this.gain - target) * smoothing;
      output[i] = delayed * this.gain;
    }
    if (!open && this.gain < 0.001) this.gain = 0;
    return true;
  }
}

registerProcessor('didiscord-mic-gate', MicGate);
