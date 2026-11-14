# public/js/app/ — o código do site

Aqui mora tudo que roda na página principal (`app.html`): chat, servidores, perfil, calls, compartilhamento de tela e configurações. Era um arquivo só (`public/js/app.js`, com mais de 10 mil linhas); agora são 29 arquivos, um por assunto.

## Como os arquivos se enxergam

São **scripts comuns** (não módulos), carregados **em ordem** pelo `app.html`, e todos dividem o mesmo escopo: um `const`, `let` ou `function` declarado no topo de um arquivo é visível em todos os outros. É exatamente como se fossem um arquivo só, cortado em pedaços. A divisão não mudou nenhuma linha de lógica (com uma exceção, marcada com comentário em `17-settings.js`).

Por que não módulos (`import`/`export`)? O estado do app (`currentChannel`, `peers`, `voiceChannel`…) é um punhado de variáveis que quase todo arquivo lê e altera. Módulos não deixam um arquivo alterar a variável de outro, então a troca exigiria reescrever o acesso a esse estado no código inteiro de uma vez. Dá pra migrar aos poucos depois; a divisão por assunto é o primeiro passo e não arrisca nada que já funciona.

## Regras pra mexer

1. **A ordem importa.** O número no nome é a ordem de carga. Código que roda **na hora em que o arquivo carrega** (fora de função) só pode usar `const`/`let` de arquivos anteriores e funções de arquivos anteriores ou do próprio arquivo. Dentro de funções e de `addEventListener(..., () => …)` pode usar qualquer coisa de qualquer arquivo, porque isso só roda depois que todos carregaram.
2. **Nomes são globais.** Antes de criar uma função ou variável no topo, procure o nome na pasta (`grep -rn "function nome" public/js/app/`). Dois `const` com o mesmo nome em arquivos diferentes derrubam o segundo arquivo inteiro. Evite nomes que o navegador já usa em `window` (`name`, `status`, `top`, `open`, `close`, `stop`, `focus`…).
3. **Arquivo novo** entra na pasta com o número da posição certa e ganha uma linha `<script>` no `app.html`, no mesmo lugar da ordem.
4. **Mudou qualquer arquivo? Suba o `?v=` de todos** no `app.html` (hoje `?v=46`). O servidor já manda tudo sem cache, mas o número igual em todos deixa claro que são do mesmo conjunto — numa call todo mundo precisa estar com a mesma versão.
5. **Estado compartilhado** (o que vários assuntos usam) fica em `01-state.js`. Estado de um assunto só fica no arquivo dele.
6. Cores, fontes e cantos sempre por variável CSS; comentários em português explicando o porquê. (Regras gerais do projeto, ver README da raiz.)

## Mapa

| Arquivo | O que tem | Por onde começar |
|---|---|---|
| `01-state.js` (232 linhas) | **Elementos da página e estado global.** estado de chamada de voz (WebRTC) | referências aos elementos do `app.html`; `currentUser`, `currentChannel`, `channels`, `members`, `peers`, `voiceChannel` |
| `02-preferences.js` (307 linhas) | **Preferências salvas neste aparelho.** preferências de dispositivo (mic / saída / câmera); sensibilidade do microfone (gate de ruído) e supressão de ruído; sons de notificação (entrar/sair de call, mensagem recebida); preferências do chat e de acessibilidade (aba "chat"/"acessibilidade"); qualidade do compartilhamento de tela (resolução + fps + bitrate + com/sem áudio); volume por participante (0–200%); volume do ÁUDIO DA TELA compartilhada por participante (0–200%), separado do volume do mic; ajustes locais por participante (silenciar/ocultar vídeo só pro meu lado); estado de voz por canal (pra pré-visualização na sidebar) | `getSaved…()` / `save…()` de microfone, supressão, tela, volumes; `getPref()`, `applyPrefs()` |
| `03-context-menus.js` (273 linhas) | **Menus de contexto (botão direito).** menu de contexto (clique direito num participante) — ajustes que valem só pro meu lado; menu de contexto (clique direito numa tile de compartilhamento de tela) | `openParticipantContextMenu()`, `micConstraints()`, `formatTime()` |
| `04-sidebar.js` (302 linhas) | **Barra lateral: canais, conversas diretas e criar canal.** sidebar / canais; lista de mensagens diretas (lateral da tela inicial); modal de criar canal | `renderChannels()`, `buildChannelItem()`, `renderVoicePreviews()`, `submitCreateChannel()` |
| `05-chat.js` (520 linhas) | **Chat: abrir canal, lista de mensagens e histórico.** chat; histórico antigo (rolar pro topo carrega mais) | `selectChannel()`, `renderMessages()`, `buildMessageEl()`, `loadOlderMessages()`, `jumpToMessage()` |
| `06-message-content.js` (229 linhas) | **Conteúdo das mensagens: Markdown, reações, fixar e prévia de links.** conteúdo das mensagens: Markdown, menções, reações, prévia de links; reações; fixar; prévia de links | `renderMessageText()`, `buildReactionsEl()`, `attachLinkEmbeds()` |
| `07-composer.js` (176 linhas) | **Caixa de mensagem: menções, emojis e "está digitando".** menções (@) e emojis (:) na caixa de mensagem; "fulano está digitando…" | `updateMentionOrEmojiPopup()`, `mentionCandidates()`, aviso de digitação |
| `08-notifications.js` (213 linhas) | **Notificações do sistema, não lidas e pular pra uma mensagem.** notificações do sistema; não lidas (guardadas no servidor) e contagem de menções; pular pra uma mensagem antiga (busca, fixadas, resposta) e voltar pro presente | `shouldNotify()`, `showSystemNotification()`, `loadUnread()`, `openMessageLocation()` |
| `09-panels-attachments.js` (408 linhas) | **Painéis de fixadas e busca, anexos e GIFs.** painéis da lateral: fixadas e busca; anexos; gif e figurinha (GIPHY) | `openPins()`, `runSearch()`, `setPendingAttachment()`, `openGifPicker()` |
| `10-video-player.js` (147 linhas) | **Player de vídeo próprio.** player de vídeo próprio (chat e visualizador) | `createVideoPlayer()` |
| `11-slash-commands.js` (390 linhas) | **Menu de comandos ("/") e envio de mensagem.** menu de comandos ("/") e autocompletar do /play | `updateCommandPopup()`, envio da mensagem (Enter), edição com seta pra cima |
| `12-members-profile.js` (711 linhas) | **Usuários, painel de membros e perfil.** cache de usuários; painel de membros; cartão de perfil; popout de perfil (clicar no avatar/nome de alguém, em qualquer lugar do app); painel de perfil na DM; edição do próprio perfil | `rememberUser()`, `findUser()`, `renderMembers()`, `renderProfileCard()`, `openViewProfile()` |
| `13-servers.js` (759 linhas) | **Servidores: barra, menu, convites, configurações e conversas diretas.** avisos rápidos (toast); tela vazia da área principal; não lidas; barra de servidores; menu do servidor (clicar no nome, no topo da lateral); criar / entrar num servidor; convidar pessoas; configurações do servidor (só dono); aceitar convite vindo do link (/invite/CODIGO -> /app.html?invite=CODIGO); mensagens diretas | `toast()`, `selectServer()`, `openServerMenu()`, `openServerSettings()`, `acceptInvite()`, conversas diretas |
| `14-roles.js` (482 linhas) | **Cargos, permissões de canal e moderação de voz.** cargos e permissões; cargos no cartão de perfil; lista de cargos (configurações do servidor); editar canal (nome, privado, quem entra na call); moderação de voz: desconectar e mover | `memberRoles()`, `memberColor()`, `applyAuthorColors()`, `renderRolesList()`, editar canal, mover/desconectar da call |
| `15-media-viewer.js` (271 linhas) | **Visualizador de imagens e vídeos.** visualizador de imagens e vídeos | `openMediaViewer()`, `closeMediaViewer()` |
| `16-site-admin.js` (232 linhas) | **Painel de admin do site.** painel de admin do site (só pra quem é admin do SITE — ver server/routes/admin.js) | `setupAdminEntry()`, painel de admin |
| `17-settings.js` (630 linhas) | **Carregamento inicial e tela de configurações.** carregamento inicial; modal de configurações de voz e vídeo | `loadUser()`, `loadServers()`, `openSettingsModal()`, `reacquireMicInCall()`, teste de microfone |
| `18-call-audio.js` (833 linhas) | **Áudio da call: microfone, supressão de ruído, sons e bot de música.** chamada de voz (WebRTC); volume acima de 100%: UM caminho só; supressão de ruído de verdade (RNNoise, WASM) — mesma família de técnica do Krisp; supressão de ruído avançada (DeepFilterNet3) — a mais parecida com a Krisp do Discord; áudio de cada pessoa da call; áudio do bot de música (server/bots/musicBot); sincronia do bot entre todo mundo | `getAudioCtx()`, `buildMicProcessingGraph()`, `rebuildMicProcessing()`, `connectPeerAudio()`, `startBotAudio()` |
| `19-call-ui.js` (692 linhas) | **Tela da call: atalhos, participantes, telas compartilhadas e estatísticas.** atalhos da call na barra lateral: supressão de ruído e compartilhar tela; telas compartilhadas; prévia da MINHA tela só roda com o dusky em foco; estatísticas REAIS da transmissão de tela (resolução, fps, bitrate medidos pelo WebRTC) | `openQuickPopup()`, `updateMinibar()`, `renderCallParticipants()`, `renderScreenShareArea()`, `updateScreenStats()` |
| `20-screencast-native.js` (225 linhas) | **Compartilhamento de tela pela placa de vídeo (app desktop).** compartilhamento de tela pela placa de vídeo (só no app desktop) | `startNativeScreenShare()`, `handleScreencastSignal()` |
| `21-call-sfu.js` (246 linhas) | **Calls pelo servidor de mídia (LiveKit).** calls pelo servidor de mídia (SFU) — LiveKit rodando no PC do servidor | `sfuConnect()`, `sfuSetTrack()`, `sfuTrackSubscribed()`, `sfuDisconnect()` |
| `22-call-mesh.js` (689 linhas) | **Calls em malha (conexão direta) e qualidade do áudio.** chamada em grupo — uma RTCPeerConnection por pessoa ("malha"/mesh); qualidade do áudio (Opus / RED) | `createPeer()`, `handleRtcSignal()`, `closePeer()`, `updateVoiceStats()`, ajustes do Opus no SDP |
| `23-call-media.js` (491 linhas) | **Câmera, compartilhar tela e entrar/sair da call.** câmera; compartilhamento de tela | `toggleCamera()`, `startScreenShare()`, `stopScreenShare()`, `joinVoiceCall()`, `leaveVoiceCall()` |
| `24-presence.js` (175 linhas) | **Rich presence ("jogando X").** "jogando X" (rich presence) | `initPresence()`, `sendMyActivity()`, `renderPresenceSettings()` |
| `25-server-settings.js` | **Configurações do servidor (tela cheia, estilo Discord).** abas por permissão; barra de alterações não salvas; perfil do servidor (nome, ícone, banner, descrição); visão geral (mensagens do sistema, canal AFK); cargos (lista + editor, @everyone, cargo de entrada); soundboard; membros; convites; banimentos; registro de auditoria; `ssAsk()` (pergunta/confirmação) | `openServerSettings()`, `refreshServerSettingsView()`, `renderSsRoles()`, `banMember()`, `ssAsk()` |
| `26-soundboard.js` | **Soundboard.** tocar o som que alguém soltou na call; seletor com os sons de todos os servidores; editor de som (onda, corte até ~5 s, nome, emoji, volume) | `handleSoundboardPlay()`, `openSoundboardPicker()`, `openSoundEditor()`, `previewSound()` |
| `27-world.js` | **Mundinho 3D (cola).** posições dos bonecos da call-mundo, envio da minha posição, áudio espacial (PannerNode), mostrar o mundo no lugar da grade e carregar `public/world/` sob demanda — ver `docs/MUNDINHO.md` | `isWorldChannel()`, `syncWorldView()`, `worldOnRemoteState()`, `createWorldPanner()` |
| `28-realtime.js` | **Eventos em tempo real e partida do app.** eventos em tempo real | `wireRealtime()` (todos os `Realtime.on(...)`) e, no fim, o bloco `init` que dá a partida no app |
| `29-mobile.js` | **Celular: gavetas de canais e de membros.** no celular (tela estreita, ver `css/mobile.css`) o chat ocupa a tela e servidores/canais e membros viram gavetas; tocar numa mensagem mostra as ações | `openMobileDrawer()`, `closeMobileDrawers()`, gesto de arrastar, bolinha de não lido no ☰ |

## Onde procurar

- **Uma mensagem aparece errada no chat** → `05-chat.js` (monta a mensagem) e `06-message-content.js` (texto, reações, prévia).
- **Algo na caixa de digitar** → `07-composer.js` e `11-slash-commands.js`.
- **Voz ruim, microfone, supressão de ruído** → `18-call-audio.js` (o processamento) e `17-settings.js` (a tela de configurações). Os worklets ficam em `public/js/worklets/`.
- **Alguém não ouve alguém** → `21-call-sfu.js` se o servidor usa `SFU=livekit`, senão `22-call-mesh.js`. Entrar e sair da call é `23-call-media.js`.
- **Tela compartilhada** → `23-call-media.js` (começar/parar), `19-call-ui.js` (mostrar), `20-screencast-native.js` (placa de vídeo, app desktop).
- **Evento que chega do servidor** (`Realtime.on`) → `28-realtime.js`.
- **Mundinho 3D** → `27-world.js` (cola) + `public/world/` (o 3D: world.js, avatar.js, props.js, tv.js e scenes/ — módulos ES carregados sob demanda) + `server/world.js`. Plano e status: `docs/MUNDINHO.md`.
- **Configurações do servidor** → `25-server-settings.js` (as regras de verdade: `server/access.js` e `server/routes/servers.js`).
- **Soundboard** → `26-soundboard.js` no site, `server/soundboard.js` + `server/routes/soundboard.js` no servidor.
- **Cargos, cor do nome, quem pode o quê na tela** → `14-roles.js`. A regra de verdade é sempre a do servidor (`server/access.js`).

Os outros scripts da página continuam onde estavam: `public/js/themes.js` (temas), `realtime.js` (WebSocket), `markdown.js`, `emoji.js`.

## Continuação: permissões, categorias e push

- `04-sidebar.js`: categorias recolhíveis, canais de texto e voz agrupados.
- `08-notifications.js` + `/sw.js`: inscrição Web Push por aparelho, preferências, cancelamento e abertura da mensagem.
- `13-servers.js`: abas das opções do servidor e editor de categorias.
- `14-roles.js`: permissões de cargos e restrições de escrita/anexo/reação/fixação por canal. A autoridade continua no backend.
- `server-options.css`: layout responsivo destas opções, seguindo as variáveis do tema.
