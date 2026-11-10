// O sinal sai com 3 ms de atraso. O pico dessa janela guia o ganho antes de
// o transiente chegar à saída, com recuperação mais lenta pra evitar distorção.
class MicLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ceiling = 10 ** (-1 / 20);
    this.attack = Math.exp(-1 / (sampleRate * 0.0005));
    this.release = Math.exp(-1 / (sampleRate * 0.08));
    this.delay = new Float32Array(Math.round(sampleRate * 0.003));
    const queueSize = this.delay.length + 2;
    this.peakFrames = new Float64Array(queueSize);
    this.peaks = new Float32Array(queueSize);
    this.head = 0;
    this.tail = 0;
    this.frame = 0;
    this.gain = 1;
    this.stopped = false;
    this.port.onmessage = ({ data }) => { if (data === 'stop') this.stopped = true; };
  }

  process(inputs, outputs) {
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    const output = outputs[0][0];
    const queueSize = this.peaks.length;

    for (let i = 0; i < output.length; i++) {
      const frame = this.frame++;
      const slot = frame % this.delay.length;
      const delayed = this.delay[slot];
      const sample = Number.isFinite(input?.[i]) ? input[i] : 0;
      this.delay[slot] = sample;

      // Mantém os picos da janela em ordem decrescente. Cada pico entra e sai
      // da fila uma vez, sem varrer toda a janela nem alocar memória por bloco.
      while (this.head !== this.tail && this.peakFrames[this.head] < frame - this.delay.length) {
        this.head = (this.head + 1) % queueSize;
      }
      const peak = Math.abs(sample);
      while (this.head !== this.tail) {
        const last = (this.tail + queueSize - 1) % queueSize;
        if (this.peaks[last] > peak) break;
        this.tail = last;
      }
      this.peakFrames[this.tail] = frame;
      this.peaks[this.tail] = peak;
      this.tail = (this.tail + 1) % queueSize;

      const target = Math.min(1, this.ceiling / this.peaks[this.head]);
      const smoothing = target < this.gain ? this.attack : this.release;
      this.gain = target + (this.gain - target) * smoothing;

      // O ataque suave prepara o ganho; a amostra atual impõe o teto mesmo num pico súbito.
      const gain = Math.min(this.gain, this.ceiling / Math.abs(delayed));
      output[i] = delayed * gain;
    }
    return true;
  }
}

registerProcessor('didiscord-mic-limiter', MicLimiter);
