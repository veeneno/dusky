// Ponte de áudio da call nativa do app desktop no Linux (ver tauri/src-tauri/src/call.rs).
// O WebKitGTK não tem WebRTC, então o transporte da call vai pelo Rust — mas o tratamento do
// microfone e a reprodução continuam aqui no site, pelo caminho de sempre.
//
//   didiscord-pcm-tap     microfone já tratado -> blocos de 20 ms (Float32, mono) pro Rust
//   didiscord-pcm-player  PCM que veio do Rust -> saída de áudio (vira MediaStream no site)

// junta o microfone em blocos de 20 ms (960 amostras a 48 kHz) e manda pela porta
class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(Math.round(sampleRate * 0.02));
    this.filled = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => { if (data === 'stop') this.stopped = true; };
  }

  process(inputs) {
    if (this.stopped) return false;
    const ch = inputs[0] && inputs[0][0];
    const n = ch ? ch.length : 128;
    for (let i = 0; i < n; i++) {
      this.block[this.filled++] = ch ? ch[i] : 0;
      if (this.filled === this.block.length) {
        // cópia (sem transferir o buffer): o WebKitGTK parava o worklet depois da 1ª transferência
        this.port.postMessage(this.block.slice());
        this.filled = 0;
      }
    }
    return true;
  }
}

// Toca o PCM que chega pela porta (Float32 intercalado, 1 ou 2 canais).
// Buffer de espera: começa a tocar com ~60 ms guardados; se esvaziar (rede engasgou), espera de
// novo; se passar de ~250 ms, joga o começo fora pra não acumular atraso.
class PcmPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channels = (options.processorOptions && options.processorOptions.channels) || 1;
    this.size = Math.round(sampleRate * 2) * this.channels; // 2 s de anel
    this.ring = new Float32Array(this.size);
    this.read = 0;
    this.write = 0;
    this.count = 0; // amostras (todos os canais) guardadas
    this.startAt = Math.round(sampleRate * 0.06) * this.channels;
    this.maxKeep = Math.round(sampleRate * 0.25) * this.channels;
    this.playing = false;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') { this.stopped = true; return; }
      this.push(data);
    };
  }

  push(samples) {
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.write] = samples[i];
      this.write = (this.write + 1) % this.size;
    }
    this.count = Math.min(this.size, this.count + samples.length);
    if (this.count > this.maxKeep) {
      // atrasado demais: pula pro fim, deixando só o ponto de partida guardado
      const skip = this.count - this.startAt;
      this.read = (this.read + skip) % this.size;
      this.count -= skip;
    }
  }

  process(_inputs, outputs) {
    if (this.stopped) return false;
    const out = outputs[0];
    const frames = out[0].length;
    if (!this.playing && this.count >= this.startAt) this.playing = true;
    for (let f = 0; f < frames; f++) {
      for (let c = 0; c < out.length; c++) {
        let v = 0;
        if (this.playing && this.count >= this.channels) {
          v = this.ring[(this.read + Math.min(c, this.channels - 1)) % this.size];
        }
        out[c][f] = v;
      }
      if (this.playing) {
        if (this.count >= this.channels) {
          this.read = (this.read + this.channels) % this.size;
          this.count -= this.channels;
        } else {
          this.playing = false; // esvaziou: espera juntar de novo
        }
      }
    }
    return true;
  }
}

registerProcessor('didiscord-pcm-tap', PcmTap);
registerProcessor('didiscord-pcm-player', PcmPlayer);
