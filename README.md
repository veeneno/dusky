# didiscord

Um Discord próprio, feito pra mim e pros meus amigos. Tem servidores com convite, canais de texto e voz, DMs, cargos, chamadas de voz/vídeo, compartilhamento de tela pela placa de vídeo, bot de música e um app desktop. Tudo roda num PC de casa, com banco SQLite e um front-end em JavaScript puro (sem framework, sem build).

O site fica em **https://didiscord.veneno.space**, por um túnel do Cloudflare. O repositório é privado: [`veeneno/didiscord`](https://github.com/veeneno/didiscord).

## O que tem

**Contas e perfil**
- Cadastro aberto e login. Conta nova não vê nada até entrar num servidor por convite.
- Perfil com avatar e banner (podem ser gif), cor de destaque (sólida ou degradê), bio e status.
- Troca de senha. Senha redefinida ou conta suspensa derruba todas as sessões abertas.

**Servidores**
- Criar servidor, trocar nome e ícone, apagar, sair.
- Convites por link (`https://didiscord.veneno.space/invite/CODIGO`), com limite de usos e validade.
- Cargos: administrador, cargo "mostrado separado" na lista de membros, e canais restritos a alguns cargos (só ver, ou ver e entrar na call).
- Moderação: expulsar membro, apagar mensagem de qualquer um, desconectar ou mover alguém de call.

**Chat**
- Canais de texto e DMs (só entre quem divide algum servidor).
- Enviar, editar, apagar e responder mensagens. Histórico carregado em páginas ao rolar pra cima.
- Anexos de qualquer tipo até 2 GB: imagem e vídeo com prévia, o resto vira um botão de download.
- GIFs e stickers do GIPHY. Links viram clicáveis.
- Marcação de canais com mensagem nova (por enquanto só na memória do navegador: some ao recarregar).

**Calls (voz, câmera e tela)**
- WebRTC direto entre as pessoas (malha: cada um tem uma conexão com cada outro).
- Mutar, ensurdecer e volume de cada pessoa de 0 a 200% (botão direito na pessoa).
- Áudio em qualidade alta: voz em Opus 96 kbps com correção de perda, som da tela em 192 kbps estéreo.
- Supressão de ruído: avançada (DeepFilterNet3, parecida com a Krisp), leve (RNNoise) ou nenhuma.
- Processamento da voz: caixa de som (cancela eco), fone de ouvido (voz mais natural) ou estúdio (nada).
- Ganho do microfone, sensibilidade (corta o mic abaixo de um volume) e "ouvir a si mesmo".
- Compartilhamento de tela com som, com volume próprio, e opção de "parar de assistir" a tela de alguém.

**Bot de música** (um por servidor, toca na call de quem pediu)

| Comando | O que faz |
|---|---|
| `/play <link ou nome>` | toca link do YouTube, música/playlist/álbum do Spotify, ou busca pelo nome |
| `/search <nome>` | mostra os 5 primeiros resultados; depois `/play <número>` escolhe |
| `/skip`, `/skipto <n>` | pula a música, ou vai direto pra posição `n` da fila |
| `/pause`, `/stop` | pausa/continua, ou para e limpa tudo |
| `/shuffle`, `/volume <0–100>` | embaralha a fila, ou muda o volume |
| `/queue`, `/queue clear` | mostra a fila, ou limpa |

O áudio sempre vem do YouTube (a API do Spotify só dá o nome, o artista e a capa). Ele é mandado como um "rádio" em mp3 pra cada pessoa da call.

**Painel de admin do site** (só a conta marcada como admin)
- Números gerais (usuários, mensagens, quem está em call, memória, espaço em disco).
- Usuários: suspender, reativar, gerar senha temporária.
- Servidores: ver e apagar.
- Aviso geral que aparece pra todo mundo conectado.

**App desktop** (Electron, Linux e Windows): abre direto no site, pede permissão de mic/câmera/tela sozinho e compartilha a tela pela placa de vídeo. Detalhes mais abaixo.

## Como rodar

Precisa do **Node 22 ou mais novo** e do **ffmpeg** (pro bot de música). O `yt-dlp` é baixado e atualizado sozinho na primeira vez.

```bash
npm install
npm start          # servidor + túnel do Cloudflare (didiscord.veneno.space)
npm run start:local  # só o servidor, em http://localhost:3000
npm run dev          # só o servidor, reiniciando sozinho a cada arquivo salvo
```

O banco SQLite é criado sozinho na primeira vez (`server/db/didiscord.db`), a partir de `server/db/schema.sql` e das migrações leves em `server/db/index.js`.

`bcrypt` e `better-sqlite3` são compilados na instalação. O npm novo bloqueia isso por padrão: os dois já estão liberados em `allowScripts` no `package.json`. Se trocar a versão do Node e o servidor reclamar de `NODE_MODULE_VERSION`, roda `npm rebuild bcrypt better-sqlite3`.

### Túnel do Cloudflare

O `npm start` sobe o servidor e o `cloudflared` juntos. Com o `.env` configurado pro túnel nomeado, o site fica no endereço fixo e o terminal mostra `túnel no ar: https://didiscord.veneno.space` quando conecta. O site só fica no ar enquanto esse terminal estiver aberto.

As credenciais do túnel ficam em `~/.cloudflared` (fora do projeto). Pra montar em outro PC:

```bash
cloudflared tunnel login
# ou copia ~/.cloudflared/<id>.json deste PC, ou cria outro túnel:
cloudflared tunnel create didiscord-veneno
cloudflared tunnel route dns didiscord-veneno didiscord.veneno.space
```

Nunca rode o servidor em dois PCs com o mesmo túnel ao mesmo tempo: o Cloudflare divide as visitas entre os dois, cada um com o próprio banco.

Sem `CLOUDFLARE_TUNNEL_MODE` no `.env`, ele volta pro túnel rápido: um endereço aleatório `*.trycloudflare.com`, que muda a cada reinício.

Alternativa sem Cloudflare: `deploy/setup-vm.sh` prepara uma VM Ubuntu com Node, ffmpeg, systemd e Caddy (HTTPS automático).

### Variáveis de ambiente (`.env`, fora do git)

Todas são opcionais: sem uma delas, a função correspondente cai num modo mais simples ou fica desligada.

| Variável | Pra quê | Sem ela |
|---|---|---|
| `PORT` | porta do servidor | `3000` |
| `SESSION_SECRET` | assina o cookie de login | usa uma chave padrão que está no código |
| `SITE_ADMINS` | conta(s) marcada(s) como admin do site no primeiro boot (separadas por vírgula) | `veneno` |
| `METERED_DOMAIN`, `METERED_SECRET_KEY` | servidor TURN do [Metered](https://www.metered.ca/), pra calls entre redes difíceis (4G, NAT) | STUN do Google + TURN público |
| `GIPHY_API_KEY` | busca de GIFs e stickers | busca de GIF desligada |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | links do Spotify no `/play` | só YouTube e busca por nome |
| `CLOUDFLARE_TUNNEL_MODE` | `nomeado` = túnel com endereço fixo | túnel rápido (endereço aleatório) |
| `CLOUDFLARE_TUNNEL_NAME` / `CLOUDFLARE_TUNNEL_TOKEN` | qual túnel nomeado usar (pelo nome em `~/.cloudflared`, ou por token do painel) | — |
| `CLOUDFLARE_TUNNEL_HOSTNAME` | endereço mostrado no terminal quando o túnel sobe | não mostra |
| `YTDLP_PATH`, `FFMPEG_PATH` | usar um `yt-dlp`/`ffmpeg` específico | `yt-dlp` baixado pelo bot e `ffmpeg` do sistema |

## Estrutura do projeto

```
didiscord/
├── server/
│   ├── index.js            # liga o Express, a sessão, as rotas, o HTTP e o WebSocket
│   ├── config.js           # chaves de serviços externos lidas do .env
│   ├── access.js           # TODAS as regras de "quem pode ver/fazer o quê" (servidor, canal, DM, cargos)
│   ├── realtime.js         # WebSocket: chat ao vivo, presença, estado de voz, sinalização WebRTC
│   ├── upload.js           # multer: avatar, banner, ícone, anexos
│   ├── wsTickets.js        # ticket de uso único pra autenticar o WebSocket
│   ├── middleware/auth.js  # requireAuth: exige login (e derruba conta suspensa / sessão antiga)
│   ├── db/                 # schema.sql, migrações (index.js), consultas de mensagem
│   ├── bots/musicBot/      # bot de música: comandos, fila, yt-dlp → ffmpeg → mp3, Spotify
│   └── routes/
│       ├── auth.js         # cadastro, login, logout, /me
│       ├── servers.js      # servidores, membros, canais, convites, cargos, moderação de voz
│       ├── channels.js     # editar/apagar canal, quem está em qual call
│       ├── messages.js     # histórico, enviar (texto, anexo, gif), editar, apagar
│       ├── dms.js          # conversas diretas
│       ├── invites.js      # prévia e aceite de convite
│       ├── users.js        # perfil de outra pessoa, contatos
│       ├── profile.js      # editar o próprio perfil, senha, avatar, banner
│       ├── admin.js        # painel de admin do site
│       ├── musicbot.js     # stream de áudio e estado do bot
│       ├── rtc.js          # servidores STUN/TURN pro WebRTC
│       ├── giphy.js        # proxy do GIPHY (a chave nunca vai pro navegador)
│       ├── ws.js           # emite o ticket do WebSocket
│       ├── bots.js         # lista de bots (estática)
│       └── server.js, members.js  # restos do modelo antigo de um servidor só (não estão ligados)
├── public/
│   ├── login.html, app.html
│   ├── css/                # um arquivo por área
│   ├── js/app.js           # o site inteiro: chat, servidores, perfil, calls, tela, configurações
│   ├── js/realtime.js      # cliente WebSocket (reconexão, eventos)
│   ├── js/auth.js          # tela de login/cadastro
│   ├── vendor/             # DeepFilterNet3 e RNNoise (supressão de ruído, em WebAssembly)
│   └── uploads/            # arquivos enviados pelo pessoal (fora do git)
├── electron/               # app desktop (ver abaixo)
├── scripts/start.js        # npm start: servidor + túnel
└── deploy/setup-vm.sh      # instalação numa VM Ubuntu (alternativa ao túnel)
```

## Modelo de dados

- **`users`**: contas. Perfil, `is_site_admin`, suspensão (`banned_at`) e `session_version` (sobe quando a senha é redefinida, pra derrubar sessões antigas).
- **`servers`**, **`server_members`**, **`invites`**: servidores, quem está em cada um, e convites (usos, validade).
- **`channels`**: canais de texto/voz de um servidor. `server_id` nulo = DM, com os 2 participantes em **`dm_members`**.
- **`messages`**: mensagens, com anexo, resposta (`reply_to_id`), edição, e `embed_json` pras respostas do bot de música.
- **`roles`**, **`member_roles`**, **`channel_role_access`**: cargos, quem tem cada um, e quais cargos veem/entram em cada canal restrito.
- **`voice_state`**: quem está em qual call (sobrevive a um reinício; enquanto o servidor está de pé, quem manda é a memória do `realtime.js`).
- **`server_settings`**: resto do modelo antigo de um servidor só (migrado pra `servers` automaticamente).

## Como o tempo real e as calls funcionam

1. O navegador pede um **ticket** de uso único (`GET /api/ws/ticket`) e abre o WebSocket em `/ws?ticket=...`.
2. Cada evento (mensagem nova, alguém entrou na call, perfil mudou...) vai só pra quem pode ver aquilo. As regras ficam todas em `server/access.js`.
3. As calls são **WebRTC direto entre as pessoas**. O servidor só repassa a sinalização (ofertas, respostas, candidatos ICE) entre quem está na mesma call. Voz, câmera e tela não passam por ele.
   - Cada conexão tem **4 canais fixos, sempre nessa ordem**: 0 microfone, 1 câmera, 2 tela, 3 som da tela. Quem recebe identifica cada faixa pela posição. Por isso todo mundo numa call precisa estar com a mesma versão do `app.js` (recarregar a página resolve).
   - A qualidade do Opus é definida no SDP que cada lado manda ("é assim que eu quero receber"). Quem estiver com um `app.js` antigo recebe o som na qualidade padrão do WebRTC (32 kbps mono).
4. A credencial do TURN do Metered fica guardada por ~50 min (`server/routes/rtc.js`), porque o plano grátis tem um limite total de credenciais. O site pede uma nova ao entrar na call, ao começar a compartilhar a tela e ao reconectar.

## App desktop (Electron)

O app **não roda o servidor**: é uma janela do Chromium que abre o site. Saiu do Tauri pro Electron porque o motor do Tauri no Linux (WebKitGTK) tinha bugs de microfone e de compartilhamento de tela.

```bash
cd electron
npm install
npm start          # abre em https://didiscord.veneno.space
npm run dev        # abre em http://localhost:3000 (servidor local)
npm run build      # gera AppImage + .deb (Linux) e instalador .exe (Windows) em electron/dist/
```

- **Endereço**: já abre em `https://didiscord.veneno.space`. Dá pra trocar pela tela de "conectando…" ou pelo menu **Servidor** (aparece apertando Alt). `DIDISCORD_URL` força um endereço.
- **Segurança da janela**: só navega pro servidor escolhido; links de fora abrem no navegador do sistema. Mic, câmera e tela são liberados sem perguntar, só pra esse endereço.
- **Seletor de tela**: no X11/Windows é um seletor próprio com miniaturas (`electron/picker/`). No Wayland quem mostra é o próprio sistema (o seletor do Hyprland, GNOME ou KDE).

### Compartilhamento de tela pela placa de vídeo

Pelo navegador, a tela é codificada no processador uma vez **por pessoa assistindo**: em 1080p60 isso era ~1 núcleo por pessoa, derrubando o fps dos jogos. No app desktop, a tela é codificada **uma vez só, na placa de vídeo**, e o auxiliar `electron/native/screencast` (em Go, com a biblioteca WebRTC Pion) manda o mesmo vídeo pra cada um.

| Sistema | Captura e codificação |
|---|---|
| Linux X11, Windows | ffmpeg: NVENC → VA-API/QSV/AMF → x264 (processador), o primeiro que funcionar |
| Linux Wayland (Hyprland, GNOME, KDE) | o auxiliar abre o portal de captura do sistema, recebe o vídeo pelo PipeWire, e o GStreamer codifica: `nvh264enc` → `vah264lpenc`/`vah264enc` → `x264enc` |
| macOS, ou sem nada disso instalado | cai pro jeito do navegador |

Medido numa RTX 3060 no Hyprland: 1080p60 a ~8% de um núcleo, e 720p60 com a redução de tamanho feita na própria placa. Um quadro-chave sai a cada 1 s, pra quem entra no meio começar rápido.

No Wayland precisa de `gst-plugin-pipewire` e `gst-plugins-bad` (NVENC/VA-API); sem placa de vídeo compatível, também `gst-plugins-ugly` (x264).

Se a conexão da tela com alguém cair, ela é refeita sozinha, com credencial TURN nova.

### Som da tela

O Electron não sabe capturar o som de um app só, então cada sistema tem um captador próprio, que manda o áudio cru pro site:

- **Linux** (`electron/audio/linux.js`): um `pw-record` desligado de tudo, e o app liga nele (com `pw-link`) só as saídas de som certas.
  - Compartilhando uma janela: só o som do processo daquela janela.
  - Compartilhando a tela inteira: todo o som do PC, menos o do próprio didiscord (senão quem assiste ouviria a própria voz de volta).
  - No Wayland o sistema não diz de qual app é a janela escolhida, então o som é escolhido antes, num seletor do didiscord (tudo, um app específico, ou nada).
- **Windows** (`electron/native/audiocap.cpp`): WASAPI Process Loopback, com a mesma regra (incluir só o app da janela, ou excluir o didiscord).

### Recompilar os auxiliares

Os executáveis prontos ficam em `electron/native/bin/` (dentro do git, porque sem eles não dá pra gerar o app).

```bash
# compartilhamento de tela (Go 1.26+)
cd electron/native/screencast
CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o ../bin/didiscord-screencast .
GOOS=windows CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o ../bin/didiscord-screencast.exe .

# som da tela no Windows (precisa do zig)
electron/native/build-cross.sh
```

## Coisas a saber antes de mexer

- **JavaScript puro, sem TypeScript, framework ou bundler**, de propósito.
- **`server/access.js` decide tudo sobre permissão.** Rota nova ou evento novo de tempo real deve perguntar pra ele, nunca refazer a regra na mão.
- **`.env`, banco e uploads nunca vão pro git** (ver `.gitignore`). Chave nova no `config.js` deve entrar na tabela de variáveis acima.
- Os comentários do código estão em português e explicam o porquê das decisões que não são óbvias. Vale ler antes de refatorar.
- Os arquivos estáticos são servidos sem cache (pra ninguém ficar com `app.js` velho depois de uma mudança), menos `public/vendor/`, que fica em cache por 30 dias.

## Próximos passos

Combinados pra fazer agora:
- Notificações do sistema, menções com `@nome` e não lidas que continuam marcadas depois de recarregar.
- App desktop que se atualiza sozinho, e uma página pra instalar o app.
- Reações com emoji e seletor de emoji.
- "fulano está digitando…".
- Chat em Markdown (títulos com `#`, negrito, itálico, código, spoiler, citação), prévia de links, busca de mensagens e mensagens fixadas.

Pra depois:
- Status "jogando X" automático.
- Soundboard na call.
- Um servidor de mídia (SFU) se o grupo passar de umas 6 pessoas por call: hoje cada um envia o próprio vídeo separado pra cada outro, e a internet de quem envia não aguenta muito mais que isso.
