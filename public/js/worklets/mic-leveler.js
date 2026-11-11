// Nivelador de volume do didiscord: roda DEPOIS do supressor de ruído, então mede só a voz.
// O ajuste automático do navegador roda antes do supressor e sobe o chiado nas pausas; aqui o
// ganho só se mexe enquanto tem fala e fica parado no silêncio. Anda devagar (é um nivelador,
// não um compressor): a dinâmica natural da voz fica, só o volume médio vai pro alvo.
class MicLeveler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.targetDb = -21;   // volume médio (RMS) da fala na saída; os picos ficam perto de -6 dBFS
    this.maxGainDb = 24;   // microfone baixo: sobe até 24 dB
    this.minGainDb = -12;  // microfone estourado: desce até 12 dB
    const start = Number.isFinite(o.initialGainDb) ? o.initialGainDb : 0;
    this.gainDb = Math.min(this.maxGainDb, Math.max(this.minGainDb, start));
    this.gain = 10 ** (this.gainDb / 20);
    this.fastPow = 0;      // energia recente (~25 ms)
    this.loudPow = 0;      // volume médio da fala (~400 ms), só atualizado enquanto tem fala
    this.floorDb = -75;    // chão de ruído: cai rápido, sobe devagar
    this.activeSec = 0;    // quanto tempo de fala já ouviu (o começo converge mais rápido)
    this.sinceReport = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => { if (data === 'stop') this.stopped = true; };
  }

  process(inputs, outputs) {
    if (this.stopped) return false;
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0][0];
    if (!input) { output.fill(0); return true; }

    const n = input.length;
    const dt = n / sampleRate;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const s = Number.isFinite(input[i]) ? input[i] : 0;
      sum += s * s;
    }
    const pow = sum / n;
    this.fastPow = pow + (this.fastPow - pow) * Math.exp(-dt / 0.025);
    const levelDb = 10 * Math.log10(this.fastPow + 1e-12);

    if (levelDb < this.floorDb) this.floorDb += (levelDb - this.floorDb) * 0.2;
    else this.floorDb = Math.min(-45, this.floorDb + dt); // 1 dB/s, nunca acima de -45 dBFS

    // fala = bem acima do chão de ruído. No silêncio o ganho congela onde estava.
    if (levelDb > -60 && levelDb > this.floorDb + 10) {
      if (this.loudPow === 0) this.loudPow = this.fastPow;
      else this.loudPow = this.fastPow + (this.loudPow - this.fastPow) * Math.exp(-dt / 0.4);
      const loudDb = 10 * Math.log10(this.loudPow + 1e-12);
      const wanted = Math.min(this.maxGainDb, Math.max(this.minGainDb, this.targetDb - loudDb));
      const diff = wanted - this.gainDb;
      if (Math.abs(diff) > 1) { // folga de 1 dB: não fica "caçando" o volume o tempo todo
        const up = (this.activeSec < 1.5 ? 18 : 3) * dt;  // dB por bloco subindo
        const down = 14 * dt;                              // desce mais rápido que sobe
        this.gainDb += Math.max(-down, Math.min(up, diff));
      }
      this.activeSec += dt;
    }

    // rampa linear dentro do bloco, pra mudança de ganho nunca virar estalo
    const next = 10 ** (this.gainDb / 20);
    const step = (next - this.gain) / n;
    let g = this.gain;
    for (let i = 0; i < n; i++) {
      g += step;
      output[i] = (Number.isFinite(input[i]) ? input[i] : 0) * g;
    }
    this.gain = next;

    this.sinceReport += dt;
    if (this.sinceReport >= 0.5) {
      this.sinceReport = 0;
      this.port.postMessage({ type: 'gain', gainDb: this.gainDb });
    }
    return true;
  }
}

registerProcessor('didiscord-mic-leveler', MicLeveler);
