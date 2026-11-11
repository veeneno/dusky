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

## `v3/pkg/df_bg_t35.wasm` (o que o app usa)

Cópia do `df_bg.wasm` com dois números trocados dentro do `df_create` (mesmo tamanho, só as
constantes): os limiares de SNR que decidem, quadro a quadro, quanto do modelo roda.

| limiar | padrão do libDF | aqui (igual CleanMic / EasyEffects) |
|---|---|---|
| min_db_thresh (abaixo: só ruído, zera) | -10 dB | -10 dB |
| max_db_erb_thresh (acima: passa o áudio cru, sem processar) | 30 dB | 35 dB |
| max_db_df_thresh (acima: pula o 2º estágio, o deep filter) | 20 dB | 35 dB |

Com o padrão, a voz perto do microfone (SNR alto) ficava pulando entre "crua", "só 1º estágio" e
"processada" a cada 10 ms: o volume e o abafamento da voz oscilavam. O pacote JS não expõe esses
limiares, por isso o patch no binário (offsets 0xE7E1DA e 0xE7E1E6 do arquivo).
