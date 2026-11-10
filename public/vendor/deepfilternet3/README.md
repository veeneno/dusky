# DeepFilterNet3 (supressão de ruído do microfone)

Usado pela opção "avançada" de supressão de ruído (configurações → voz). É a alternativa aberta
mais próxima da Krisp que o Discord usa.

- `index.esm.js` — do pacote npm `deepfilternet3-noise-filter@1.3.0` (MIT OU Apache-2.0), só a
  classe `DeepFilterNet3Core` é usada; o app não depende do LiveKit. Alteração local marcada com
  `[didiscord]`.
- `v3/pkg/df_bg.wasm` — motor compilado (Rust → WebAssembly) que acompanha o pacote.
- `v3/models/DeepFilterNet3_onnx.tar.gz` — modelo oficial do DeepFilterNet3
  (https://github.com/Rikorose/DeepFilterNet), sha256 idêntico ao do repositório original:
  `c94d91f70911001c946e0fabb4aa9adc37045f45a03b56008cb0c8244cb63616`.
- `benchmark.html` — mede velocidade e quanto ruído é removido, direto no navegador.

Servido do próprio servidor (sem depender de CDN de terceiros). ~24 MB, baixados uma vez por
pessoa e guardados no cache do navegador.
