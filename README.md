# didiscord

Um clone minimalista do Discord, feito pra **um servidor privado de exatamente 2 pessoas**. Sem contas ilimitadas, sem múltiplos servidores, sem frescura — só chat de texto, chamada de voz/vídeo com WebRTC (incluindo áudio da tela compartilhada, com volume 0–200% ajustável por botão direito), e as customizações de perfil que dão a cara de Discord (avatar, banner, cor de destaque, bio, gifs via GIPHY).

Feito pra rodar em casa/VPS pequena, com banco SQLite local e front-end vanilla (sem framework, sem build step).

> **Compartilhamento de tela no app desktop:** codifica UMA vez na placa de vídeo e manda o mesmo vídeo pra cada pessoa (auxiliar `electron/native/screencast`, em Go/Pion).
> - **X11 / Windows:** ffmpeg captura e codifica (NVENC → VA-API/QSV/AMF → x264).
> - **Wayland (Hyprland, GNOME, KDE):** o auxiliar abre o portal do sistema (`org.freedesktop.portal.ScreenCast`), recebe o fd do PipeWire e o GStreamer captura e codifica (`nvh264enc` → `vah264lpenc`/`vah264enc` → `x264enc`). Precisa de `gst-plugin-pipewire` + `gst-plugins-bad` (NVENC/VA-API) e, sem placa, `gst-plugins-ugly` (x264). O som é escolhido antes, no seletor do didiscord (PipeWire), porque o Wayland não diz de qual app é a janela escolhida.
> - Sem nada disso, cai pro `getDisplayMedia` do Chromium (codifica no processador, uma vez por pessoa).
> - Medido (RTX 3060, Hyprland): 1080p60 ≈ 8% de um núcleo; 720p60 reduzido pelo OpenGL na placa, 60 fps.

## Stack

- **Backend**: Node.js + Express (CommonJS, sem TypeScript)
- **Banco**: SQLite via `better-sqlite3` (arquivo único, `server/db/didiscord.db`)
- **Tempo real**: WebSocket puro (`ws`) — chat ao vivo, presença online/offline, sinalização WebRTC
- **Chamadas de voz/vídeo**: WebRTC (peer-to-peer), com STUN/TURN via [Metered](https://www.metered.ca/) (opcional) + fallback público (Google STUN + Open Relay Project)
- **Auth**: sessão via cookie (`cookie-session`), senha com `bcrypt`
- **Uploads**: `multer` (avatares, banners, ícone do servidor, anexos de mensagem — imagem/vídeo/gif)
- **Front-end**: HTML/CSS/JS puro, sem framework nem bundler — servido estático direto de `public/`
- **App desktop**: [Electron](https://www.electronjs.org/) — janela nativa (Chromium completo) carregando o site hospedado

## Como rodar

```bash
npm install
npm start        # produção
npm run dev       # com --watch (reinicia sozinho ao salvar)
```

O servidor sobe em `http://localhost:3000` (ou na porta da env `PORT`). O banco SQLite é criado automaticamente na primeira execução (`server/db/didiscord.db`), aplicando `server/db/schema.sql` e as migrações leves em `server/db/index.js`.

Em produção, `npm start` sobe o servidor **e** o túnel nomeado do Cloudflare: o site fica em **https://didiscord.veneno.space** (endereço fixo, o app desktop já abre nele). Configurado no `.env` (`CLOUDFLARE_TUNNEL_MODE=nomeado`, `CLOUDFLARE_TUNNEL_NAME=didiscord-veneno`, `CLOUDFLARE_TUNNEL_HOSTNAME`), com as credenciais em `~/.cloudflared`. Pra montar em outro PC: `cloudflared tunnel login`, e copiar `~/.cloudflared/<id>.json` ou criar outro túnel com `cloudflared tunnel create` + `cloudflared tunnel route dns <nome> didiscord.veneno.space`. Sem `CLOUDFLARE_TUNNEL_MODE`, volta pro túnel rápido (endereço aleatório `*.trycloudflare.com`, muda a cada reinício).

### Variáveis de ambiente (`.env`, não commitado)

Todas são **opcionais** — sem elas, a feature correspondente simplesmente cai num modo mais simples:

| Variável | Pra quê serve | Sem ela |
|---|---|---|
| `PORT` | porta do servidor | usa `3000` |
| `SESSION_SECRET` | assina o cookie de sessão | usa um valor padrão inseguro — **troque antes de expor o site na internet** |
| `METERED_DOMAIN` / `METERED_SECRET_KEY` | credenciais TURN do [Metered](https://www.metered.ca/) pra chamadas atravessarem NAT/redes diferentes | cai pro fallback público (Google STUN + Open Relay Project TURN) |
| `GIPHY_API_KEY` | busca de gifs/stickers no chat | a busca de GIPHY fica desabilitada (erro 503 nessa rota) |

## Conceito do produto (o que é "fixo" de propósito)

Isso não é um Discord genérico — é um app com regras hardcoded pra um caso de uso específico:

- **Máximo de 2 usuários** (`MAX_USERS` em `server/routes/auth.js`). Depois disso, `/api/auth/register` recusa novas contas.
- **Um único "servidor"** (não existe lista de servidores/guilds). `server_settings` no banco é sempre a linha `id = 1`.
- **Canais são só texto ou voz**, sem categorias, sem permissões por cargo — os dois usuários podem tudo (criar/apagar canal, apagar mensagem de qualquer um, trocar ícone/nome do servidor).
- **Bots são um registro estático vazio** (`server/routes/bots.js`, array `BOTS = []`). A ideia é que, se algum dia quiser um bot, é só empurrar um objeto nesse array — a estrutura de exibição (mensagens com `bot_name` em vez de `user_id`) já existe no schema.

Se algum humano ou IA for expandir isso pra suportar mais gente, esses são os pontos que precisam mudar primeiro.

## Estrutura do projeto

```
didiscord/
├── server/
│   ├── index.js          # bootstrap: express, sessão, monta rotas, sobe HTTP+WS
│   ├── config.js          # lê chaves externas (Metered, GIPHY) do .env
│   ├── realtime.js        # servidor WebSocket: chat ao vivo, presença, sinalização WebRTC
│   ├── upload.js           # configuração do multer (avatar/banner/ícone/anexos)
│   ├── wsTickets.js        # tickets de curta duração pra autenticar o handshake do WS
│   ├── middleware/auth.js  # requireAuth — exige sessão válida, popula req.user
│   ├── db/
│   │   ├── index.js         # abre o SQLite, aplica schema.sql + migrações leves
│   │   ├── schema.sql        # definição das tabelas
│   │   └── didiscord.db      # arquivo do banco (gerado, não commitado)
│   ├── bots/                # (vazio por enquanto — ver seção "bots" acima)
│   └── routes/
│       ├── auth.js          # registro / login / logout / me
│       ├── channels.js      # listar / criar / apagar canais
│       ├── messages.js      # histórico, enviar texto/anexo/gif, apagar mensagem
│       ├── members.js       # lista os 2 membros do servidor + status online
│       ├── profile.js       # editar perfil (nome, cor, bio), trocar senha, avatar/banner
│       ├── server.js        # nome e ícone do "servidor" (sidebar)
│       ├── bots.js          # lista de bots (estática, vazia)
│       ├── rtc.js           # devolve ICE servers (STUN/TURN) pro WebRTC
│       ├── giphy.js         # proxy autenticado pra API do GIPHY (a key nunca vai pro client)
│       └── ws.js            # emite o ticket usado pra abrir a conexão WebSocket
├── public/
│   ├── login.html / app.html
│   ├── css/                 # um arquivo por área (chat, members, profile, settings, voice, tema)
│   ├── js/
│   │   ├── auth.js           # lógica da tela de login/registro
│   │   ├── app.js            # SPA principal: chat, canais, perfil, chamadas WebRTC
│   │   └── realtime.js        # cliente WebSocket (reconexão, dispatch de eventos)
│   ├── vendor/               # libs de terceiros servidas localmente
│   └── uploads/              # avatares/banners/ícones/anexos enviados (gitignored, exceto .gitkeep)
├── electron/                  # app desktop (Electron) — ver seção abaixo
│   ├── package.json           # projeto Electron auto-contido (não mistura deps com o servidor)
│   ├── main.js                 # janela principal, guarda de navegação, permissões de mídia
│   ├── pickerPreload.js          # ponte de IPC só pra janelinha de escolher tela/janela
│   ├── loading.html               # casca local: fica testando até o site hospedado responder
│   ├── picker.html                 # seletor próprio de tela/janela pro compartilhamento
│   └── icons/icon.png               # ícone do app (256×256)
├── .env                      # segredos locais (gitignored)
└── package.json
```

## Modelo de dados (visão rápida)

- **`users`** — os (no máx. 2) usuários: login, avatar/banner (podem ser gif), cor de destaque (com opção de degradê via `accent_color_2`), bio, status.
- **`channels`** — canais de texto ou voz, com posição pra ordenação manual.
- **`messages`** — mensagens de um canal; `user_id` nulo + `bot_name` preenchido significa que foi um bot; suporta anexo (imagem/vídeo/gif) e resposta a outra mensagem (`reply_to_id`).
- **`server_settings`** — linha única (`id = 1`) com nome e ícone exibidos no topo da sidebar.
- **`voice_state`** — estado de quem está em call (canal, mudo, surdo, câmera, compartilhamento de tela); persiste no banco pra sobreviver a um restart do servidor, mas quem manda de verdade é o estado em memória de `realtime.js` enquanto o processo está de pé.

## Tempo real: como o chat e as calls funcionam

1. O cliente pede um **ticket** de curta duração (`GET /api/ws/ticket`, exige sessão) e abre o WebSocket em `/ws?ticket=...`. O ticket existe porque o handshake do WS não tem acesso direto ao cookie de sessão da mesma forma que uma request HTTP normal.
2. Depois de conectado, o servidor faz **broadcast** de tudo pra todo mundo (`channel_created`, `message_created`, `profile_updated`, `presence_online/offline`, etc.) — não tem lógica de "salas"/rooms porque só existe um servidor com 2 pessoas.
3. **Chamadas de voz/vídeo** são WebRTC peer-to-peer de verdade: o WebSocket só relaia sinalização (`voice_join`, `rtc_signal` com offer/answer/ICE candidates). Toda a lógica de `RTCPeerConnection` mora no front-end (`public/js/app.js`). O backend só entrega a lista de ICE servers (`GET /api/rtc/ice-servers`).
   - A conexão usa **4 transceivers fixos**, sempre nessa ordem (`setupTransceivers` em `app.js`): `0` mic (áudio), `1` câmera (vídeo), `2` tela (vídeo), `3` áudio da tela compartilhada. O lado que recebe (`ontrack`) identifica cada faixa pela **posição** do transceiver, não por metadado — então os dois usuários precisam estar rodando a mesma versão do `app.js` numa call, senão a indexação desalinha.
   - O áudio da tela toca separado do áudio do mic (elemento `<audio id="callRemoteScreenAudio">` dedicado), com volume 0–200% próprio por participante (botão direito na tile da tela compartilhada), independente do volume da voz da pessoa.
4. A credencial TURN do Metered é cacheada em memória por ~50min (`server/routes/rtc.js`) porque o plano free tem cota total de credenciais geradas, não por hora — gerar uma nova a cada entrada em call estourava a cota rápido.

## Coisas a saber antes de mexer

- **Sem TypeScript, sem framework de front-end, sem bundler.** É JS puro de propósito — mantenha assim a menos que haja um motivo forte pra mudar.
- **`.env` nunca vai pro git** (está no `.gitignore`). Se adicionar uma chave nova em `config.js`, documente aqui na tabela de variáveis de ambiente.
- **Uploads e o arquivo `.db` também são gitignored** — o repo só carrega código, não dados de usuário.
- Praticamente todas as rotas exigem sessão (`requireAuth`) — as únicas exceções são `POST /api/auth/register` e `POST /api/auth/login`.
- Não existe sistema de permissões/cargos: qualquer um dos 2 usuários pode apagar mensagem/canal do outro, trocar nome/ícone do servidor, etc. Isso é intencional pro caso de uso (servidor de confiança entre 2 pessoas), não um bug.
- Os comentários no código já estão em português explicando o "porquê" de decisões não óbvias (cache de credencial TURN, tickets de WS, etc.) — vale ler antes de refatorar essas partes.

## App desktop com Electron

O app desktop (Linux e Windows, via [Electron](https://www.electronjs.org/)) **não sobe o servidor Node sozinho** — ele só abre uma janela nativa apontando pro servidor. Na primeira vez, pergunta o endereço (o do túnel, ou um IP tipo `203.0.113.5:3000`) e guarda; se um dia não carregar, oferece trocar. Também dá pra trocar pelo menu **Servidor → Mudar endereço do servidor…** (o menu aparece apertando Alt). O servidor é subido separadamente (na VPS/casa), do jeito de sempre (`npm start`).

> Esse projeto trocou de [Tauri](https://tauri.app/) (Rust + WebKitGTK) pra Electron porque o WebKitGTK no Linux tinha bugs de longa data em `getUserMedia`/Web Audio (mic ficava mudo em certas configurações) e em `getDisplayMedia` (compartilhamento de tela instável via PipeWire). Electron usa o Chromium completo em todas as plataformas — o mesmo motor já validado funcionando no navegador —, o que elimina essa categoria inteira de bug. É também a mesma escolha que o Discord de verdade faz.

### Como funciona a janela

1. A janela abre carregando uma "casca" local embutida no app (`electron/loading.html`) — uma tela de loading simples, sem depender de rede nenhuma pra aparecer.
2. Se ainda não tem endereço salvo, a casca pergunta. Com endereço, fica testando (`fetch` com backoff, até 10s entre tentativas) se o servidor está no ar.
3. Assim que responde, a página navega de verdade (`window.location.href`) pro site — daí em diante é o mesmo front-end de sempre (`public/`), só que dentro de uma janela nativa em vez do navegador.
4. Se o servidor estiver fora do ar, a tela de loading continua tentando e, depois de uns segundos, oferece **mudar endereço** (o do túnel muda quando o servidor reinicia).
5. Por segurança, a navegação da janela é restrita em `electron/main.js` (`ALLOWED_NAVIGATION_HOSTS`) só ao servidor escolhido (+ localhost em modo dev, via `DIDISCORD_DEV=1`). Servidor por IP é HTTP puro: o app marca só esse endereço como seguro pro Chromium (`--unsafely-treat-insecure-origin-as-secure`), senão mic/câmera/tela ficariam bloqueados — evita que a janela nativa acabe navegando pra um domínio arbitrário. Links/`target=_blank` pra fora do domínio também são bloqueados (`setWindowOpenHandler`).

### Permissões de mic/câmera

Como esse app só roda pros 2 usuários de confiança do didiscord, `session.setPermissionRequestHandler` em `main.js` libera `media`/`audioCapture`/`videoCapture`/`display-capture` direto, sem diálogo de confirmação do sistema.

### Compartilhamento de tela

Electron não mostra um seletor nativo de tela/janela sozinho no Linux (ao contrário do Chrome/Edge de verdade, que têm um picker do sistema). Por isso `main.js` implementa `session.setDisplayMediaRequestHandler`, que:

1. Lista as fontes disponíveis via `desktopCapturer.getSources` (telas inteiras + janelas individuais, com miniatura);
2. Abre uma janelinha modal própria (`electron/picker.html`, via `pickerPreload.js`) mostrando essas opções;
3. Devolve a fonte escolhida pro `getDisplayMedia()` que o front-end (`public/js/app.js`) já chama normalmente — nenhuma mudança foi necessária no código de chamada em si, só no lado do Electron que intercepta esse pedido.

**Áudio de sistema durante o compartilhamento ainda é limitado no Linux** — ver próximo tópico.

### Rodando pela primeira vez

```bash
cd electron
npm install       # baixa o electron (binário do Chromium, ~300MB) + electron-builder
npm run dev        # abre a janela em modo dev
```

Pra empacotar (gera `.deb`/AppImage no Linux, `.exe` via NSIS no Windows):

```bash
npm run build
```

O ícone já está em `electron/icons/icon.png` (256×256) — pra melhor qualidade em telas de alta resolução, vale gerar um de 512×512 ou 1024×1024 no lugar antes de um build final.

### Próximo passo: áudio de sistema no compartilhamento de tela (Linux)

O vídeo do compartilhamento de tela já funciona (ver seção acima). O que falta é áudio de sistema no Linux — duas limitações que o app desktop ainda precisa resolver:

1. **Captura de áudio de sistema é inconsistente entre SOs.** O parâmetro `audio: 'loopback'` do `setDisplayMediaRequestHandler` (já usado em `main.js` pra Windows/macOS) é suporte *best-effort* do próprio Electron nessas plataformas; no Linux, atualmente `main.js` nem tenta (manda `audio: undefined` de propósito) porque não há suporte confiável via PipeWire/PulseAudio embutido no Chromium do Electron.
2. **Nenhuma API pronta deixa excluir seletivamente o áudio do próprio app** de uma captura de sistema inteiro. Isso importa porque, se a captura de áudio de sistema pegar também o áudio que o próprio didiscord está tocando (a voz do outro participante da call), quem está assistindo a tela ouve a própria voz duplicada/ecoada — já que ela já chega por ela mesma pelo áudio direto da call.

**Regra de ouro:** por padrão, o compartilhamento de tela nunca deve carregar o áudio que o próprio didiscord está reproduzindo (a chamada em si), pra não duplicar a voz de quem está assistindo. A exceção é quando a pessoa compartilha deliberadamente a janela/aba do próprio didiscord (ex: pra mostrar o app funcionando) — nesse caso faz sentido incluir o áudio real.

**Arquitetura planejada pro Linux:**

- Sem exclusão direta por processo (ao contrário do WASAPI Process Loopback do Windows), mas dá pra resolver por **roteamento no PipeWire**: criar um sink nulo dedicado (`pw-loopback`) e mover especificamente o stream de saída do didiscord (áudio da call) pra esse sink separado, deixando o monitor do sink padrão do sistema (capturado como "áudio da tela/jogos") livre do áudio do próprio app.
- Diferente do scaffold antigo em Tauri (que precisaria disso em Rust via `webkit2gtk`/FFI), em Electron isso fica bem mais direto: `main.js` roda em Node.js puro, então o roteamento pode ser feito chamando `pw-loopback`/`pactl` via `child_process.spawn` direto no processo principal — sem precisar de nenhuma binding nativa.
- Isso vira um **handler IPC** exposto via `contextBridge` num `preload.js` da janela principal (hoje ainda não existe; a janela principal roda sem preload porque não precisa de nenhuma ponte ainda). O front-end (`public/js/app.js`, que roda no servidor remoto) chamaria esse handler pra saber qual `deviceId` de áudio usar no `getUserMedia`, reaproveitando os mesmos transceivers WebRTC que já existem (ver seção "Tempo real" acima) — sem precisar reimplementar WebRTC em Node.
- Como o front-end que vai chamar esse IPC roda no domínio remoto (não a casca local), e o `preload.js` da janela principal ainda não expõe nada via `contextBridge`, essa ponte precisa ser criada quando essa feature for implementada.

Se você (humano ou IA) estiver continuando esse trabalho, comece perguntando qual pedaço focar: o protótipo do roteamento PipeWire em si (script/comando standalone antes de virar handler IPC), ou já direto o handler + preload + a mudança em `app.js` pra consumir o device filtrado.

## Ideias de próximos passos (se for expandir)

- Suportar mais de 2 usuários (mexer em `MAX_USERS`, e provavelmente introduzir permissões por cargo).
- Bots de verdade: o array `BOTS` em `server/routes/bots.js` e a coluna `bot_name` em `messages` já preveem esse caso, falta implementar o envio de mensagens por um bot.
- Categorias de canais, se a lista crescer além de uns poucos.
- Notificações (push/desktop) — hoje tudo depende da aba estar aberta e conectada ao WebSocket.
- App desktop pra Windows (áudio de sistema via `audio: 'loopback'` do Electron, já tentado automaticamente em `main.js` — falta testar de verdade numa máquina Windows).
