# dusky — app desktop em Rust (Tauri 2)

Substituto do app Electron (`../electron`). Mesma ideia: abre uma janela nativa apontando pro site
hospedado e adiciona o que o navegador não faz. O site não precisa mudar nada: a ponte
`window.duskyDesktop` tem a mesma API do `electron/preload.js`.

## O que já funciona

| | Linux | Windows |
|---|---|---|
| Janela, tela de "conectando…", trocar endereço do servidor | ✅ | ✅ |
| Bandeja (abrir, ativo/inativo, continuar rodando ao fechar, recarregar, sair) | ✅ | ✅ |
| Instância única, tamanho/posição da janela salvos | ✅ | ✅ |
| Contador de menções e piscar na barra de tarefas | ✅ | ✅ (contador só no texto da bandeja) |
| Mic/câmera/notificações liberados só pro servidor | ✅ | ✅ |
| Compartilhar tela pela placa de vídeo (helper em Go, seletor com miniaturas) | ✅ X11 e Wayland | ✅ |
| Áudio da tela (só o app escolhido ou tudo menos o dusky) | ✅ PipeWire | ✅ audiocap |
| Call: voz (falar, ouvir, mudo/surdo, volume por pessoa, "falando") | ✅ pelo Rust (ver abaixo) | ✅ |
| Call: supressão de ruído, gate, nivelador, limitador | ✅ | ✅ |
| Call: assistir tela/câmera dos outros, mandar câmera | ✅ pelo Rust | ✅ |
| Call: áudio da tela compartilhada indo pra call | ✅ pelo Rust | ✅ |
| Call: números de qualidade (perda, jitter, ping) | ✅ pelo Rust | ✅ |
| "Jogando X" (presence) e atualização automática | ainda não | ainda não |

### Call no Linux

O WebKitGTK das distros (o motor do Tauri no Linux) vem sem WebRTC — `RTCPeerConnection` não
existe. Então no Linux só o **transporte** da call sai da página e vai pro Rust
(`src-tauri/src/call.rs`, com o SDK do LiveKit):

```
microfone   → getUserMedia → supressão de ruído / gate / nivelador / limitador (os do site)
            → worklet dusky-pcm-tap → call_push_mic → LiveKit
quem fala   → LiveKit → call_pull (a página busca em laço) → worklet dusky-pcm-player
            → MediaStream → o caminho de sempre do site (<audio>, volume, reforço, áudio espacial)
tela deles  → o dusky-screencast em modo "watch" (Pion, Go) entra oculto ("ver-<id>") e
            entrega o vídeo AINDA COMPRIMIDO → call_pull_video → VideoDecoder (WebCodecs, na
            placa de vídeo quando dá) → <canvas> mostrado direto no lugar do <video>.
            Sem limite de fps: 15 → 15, 60 → 60, 120 → 120 (o monitor ainda manda no que aparece)
câmera deles → LiveKit → JPEG no Rust (até 1080p, 30 fps) → call_pull_video → <canvas>
            → canvas.captureStream() → o <video> de sempre do site
minha câmera → <canvas> → JPEG → call_push_camera → LiveKit
som da tela → captador do PipeWire → direto pro LiveKit (faixa "som-da-tela"), sem passar pela página
qualidade   → call_stats → números do libwebrtc no formato do getStats() do navegador
```

Testado de ponta a ponta (app + Chromium na mesma sala): voz nos dois sentidos, câmera nos dois
sentidos, a tela pela placa de vídeo + o som dela chegando no Chromium, os números de qualidade, e
a tela dos outros chegando a 15 e a 60 fps exatos (120 fps chegou inteiro no app; a página só não
deu conta de decodificar tudo porque o PC de teste não tinha placa de vídeo).

A tela dos outros pelo auxiliar precisa do servidor atualizado (`GET /api/rtc/sfu?viewer=1`, que dá
o ingresso do participante oculto). Com servidor antigo, ou sem o auxiliar, as telas vêm em JPEG.

O servidor não muda (o ingresso vem do mesmo `GET /api/rtc/sfu`), mas **precisa estar com
`SFU=livekit`** — a call em malha (sem servidor de mídia) não funciona no app do Linux. O lado do
site está em `public/js/app/21-call-sfu.js` (parte "app desktop no Linux") e
`public/js/worklets/pcm-bridge.js`. No navegador e no app do Windows nada disso é usado.

## Como rodar

### Linux

Arch:

```bash
sudo pacman -S --needed base-devel webkit2gtk-4.1 libayatana-appindicator librsvg xdotool openssl \
  clang gst-plugin-pipewire gst-plugins-good pipewire ffmpeg rustup nodejs npm
rustup default stable
```

Ubuntu/Debian:

```bash
sudo apt install build-essential curl file libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev libssl-dev gstreamer1.0-pipewire gstreamer1.0-plugins-good
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# o clang do Ubuntu é velho pro SDK do LiveKit (precisa de 21+):
wget https://apt.llvm.org/llvm.sh && sudo bash llvm.sh 21
```

Depois, nos dois:

```bash
cd tauri
npm install
npm run dev          # abre o app (modo debug; a 1ª vez baixa o libwebrtc, ~100 MB)
npm run build        # gera .deb e .AppImage em src-tauri/target/release/bundle/
```

Os scripts `dev`/`build` escolhem o clang sozinhos (`clang-21` se existir, senão `clang`); dá pra
forçar com `CC`/`CXX`. Pra compartilhar a tela: `ffmpeg` (X11) ou o plugin do PipeWire do
GStreamer (Wayland). Pro áudio da tela: as ferramentas do PipeWire (pw-record, pw-link, pw-dump).

### Windows

Instale o [Rust](https://rustup.rs) (com as "Build Tools" do Visual Studio que o instalador pede) e
o Node. Depois, no PowerShell:

```powershell
cd tauri
npm install
npm run dev
npm run build        # gera o instalador em src-tauri\target\release\bundle\nsis\
```

### Variáveis úteis

- `DUSKY_URL=https://outro.endereco` força um servidor (não pergunta nada). As variáveis antigas `DIDISCORD_*` continuam valendo.
- `DUSKY_DEV=1` aponta pra `http://localhost:3000` (o `npm run dev` do servidor).
- `FFMPEG_PATH=/caminho/ffmpeg` usa um ffmpeg específico no compartilhamento de tela.
- `DUSKY_INJECT_JS=arquivo.js` (só no modo debug) roda um script extra em toda página — foi
  assim que a call foi testada de ponta a ponta (app + Chromium na mesma sala).

## Como é organizado

```
tauri/
  ui/loading.html, ui/picker.html   telas locais (copiadas do electron/, sem mudança)
  src-tauri/
    src/bridge.js       ponte JS: window.duskyDesktop / duskyShell / pickerApi
    src/app.rs          janela, conexão com o servidor, comandos do site, ciclo de vida
    src/tray.rs         ícone da bandeja
    src/picker.rs       janela de escolher tela/janela (ou só o som, no Wayland)
    src/sources.rs      lista telas e janelas com miniatura (X11 / Windows)
    src/screencast.rs   detecta o codificador e conversa com o dusky-screencast
    src/deps.rs         baixa o ffmpeg (versão fixa + SHA-256)
    src/audio/          áudio da tela: linux.rs (PipeWire), windows.rs (audiocap)
    src/call.rs         call pelo LiveKit no Rust (só Linux; no Windows é o call_stub.rs)
    capabilities/       quem pode chamar o quê (o site ganha a dele em tempo de execução)
```

Os binários `dusky-screencast` e `dusky-audiocap.exe` vêm de `../electron/native/bin` e
vão junto no instalador (ver `tauri.linux.conf.json` / `tauri.windows.conf.json`).

No Windows o **ffmpeg vai dentro do instalador** (+~27 MB comprimido): o `npm run dev`/`build`
baixa uma vez o ffmpeg 8.1.2 "essentials" do gyan.dev (versão fixa, conferida por SHA-256 — ver
`scripts/fetch-ffmpeg.js`) pra `src-tauri/vendor/ffmpeg/`, que fica fora do git. Assim compartilhar
tela pela placa de vídeo funciona sem a pessoa instalar nada. No Linux usa o ffmpeg do sistema.

## Testes

```bash
cd src-tauri
cargo test
cargo test -- --ignored lista_fontes --nocapture   # lista telas/janelas (precisa de X11)
```
