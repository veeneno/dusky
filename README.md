# dusky

Um Discord próprio, feito pra mim e pros meus amigos. Tem servidores com convite, canais de texto e voz organizados em categorias, DMs, cargos, chamadas de voz/vídeo, compartilhamento de tela pela placa de vídeo, soundboard, bot de música, um **mundinho 3D** com jogos (Duno, 21, xadrez e sinuca) e um app desktop em Rust. Tudo roda num PC de casa, com banco SQLite e um front-end em JavaScript puro (sem framework, sem build).

O site fica em **https://dusky.veneno.space**, por um túnel do Cloudflare. O código é aberto, sob a [AGPL-3.0](#licença): [`veeneno/dusky`](https://github.com/veeneno/dusky).

## O que tem

**Contas e perfil**
- Cadastro aberto, com **e-mail confirmado por código** (6 dígitos, enviado pelo [Resend](https://resend.com)), caixinha de **13 anos ou mais** e aceite dos termos, e **anti-robô** (Cloudflare Turnstile). Conta antiga sem e-mail confirmado fica presa na tela de confirmar até adicionar um. Conta nova não vê nada até entrar num servidor por convite.
- Entrar com **nick ou e-mail**. **Esqueci minha senha** por código no e-mail.
- **Verificação em 2 etapas** opcional: app autenticador (com QR code e 8 códigos de recuperação), código por e-mail, ou os dois.
- Perfil com avatar e banner (podem ser gif, inclusive do GIPHY), cor de destaque (sólida ou degradê), bio e status.
- **Cartão de perfil no tamanho do Discord** (300 px de largura), com o cartão inteiro nas cores da pessoa.
- **Efeito no nome**: LED RGB, neon, degradê, brilho ou pulso (com as cores escolhidas), aparecendo no chat, na lista de membros e no cartão.
- **Decorações do Discord**: decoração do avatar (molduras), placa do nome e efeito de perfil, escolhidas numa galeria com busca (catálogo com ~1.400 itens, ver [`docs/decor-catalog.md`](docs/decor-catalog.md)). Os efeitos de perfil animados mantêm a proporção original (feitos pra um cartão de 300 × 587) e só tocam quando estão na tela.
- Troca de senha (mínimo 8 caracteres): derruba os outros aparelhos e mantém o atual. Senha redefinida ou conta suspensa derruba todas as sessões.
- **Seus dados (LGPD)**: baixar tudo num JSON e **excluir a conta** (os dados pessoais somem e a conta vira "conta excluída N"; a pessoa escolhe se as mensagens vão junto). Páginas de [termos de uso](https://dusky.veneno.space/termos) e [privacidade](https://dusky.veneno.space/privacidade).
- **Denunciar** mensagem ou pessoa (bandeira na mensagem, "denunciar" no perfil). O texto e o anexo ficam guardados como prova mesmo se apagarem depois.

**Servidores**
- Criar servidor, trocar nome e ícone, apagar, sair.
- Convites por link (`https://dusky.veneno.space/invite/CODIGO`), com limite de usos e validade.
- Cargos com permissões independentes: gerenciar canais/categorias, apagar mensagens de outros, expulsar membros e moderar calls. Administrador mantém acesso completo.
- Restrições por canal e cargo: ver, entrar na call, enviar mensagens, anexar/GIFs, reagir e fixar. Sem restrição, mantém o comportamento anterior.
- **Canais e categorias no estilo do Discord**:
  - canais sem categoria ficam no topo, sem título; cada categoria tem a setinha de recolher (lembrado no aparelho) e o **+** pra criar canal nela, que aparece ao passar o mouse;
  - **botão direito**: no espaço vazio (criar canal, criar categoria, convidar), na categoria (recolher, recolher todas, criar canal, editar, apagar, copiar ID) e no canal (convidar, editar, apagar, copiar ID);
  - **arrastar pra reordenar**: canais (inclusive de uma categoria pra outra, ou pro topo) e categorias; texto sempre antes de voz dentro de cada categoria;
  - **criar canal** com o tipo em lista (texto, voz ou mundinho), `#` no nome (vira `nome-assim` enquanto digita) e **canal privado** (já abre a escolha de quais cargos veem);
  - servidor novo já nasce com as categorias "canais de texto" e "canais de voz"; apagar categoria conserva canais e histórico.
- **Configurações do servidor em tela cheia, no estilo do Discord** (cada aba só aparece pra quem tem a permissão dela):
  - **perfil do servidor**: nome, ícone, banner (aparece no topo da lista de canais) e descrição, com prévia ao vivo;
  - **visão geral**: canal de mensagens do sistema (com frases de boas-vindas aleatórias quando alguém entra) e canal AFK (quem fica sem falar por 1 min a 1 h é levado pra lá);
  - **cargos**: lista + editor (exibição, permissões, membros), permissões do **@everyone** e **cargo de entrada** (todo mundo que entra pelo convite ganha; dá pra aplicar em quem já está);
  - **categorias**, **soundboard**, **membros**, **convites** (ver e revogar), **banimentos** e **registro de auditoria** (90 dias, com filtro por pessoa e ação);
  - alterações no perfil/visão geral ficam numa barra "não salvas", igual ao Discord.
- Permissões de cargo: gerenciar servidor, gerenciar canais, ver auditoria, expulsar, banir, gerenciar mensagens, moderar calls, usar soundboard, usar sons externos e gerenciar soundboard.
- Moderação: expulsar, **banir** (não volta por convite até ser desbanido), apagar mensagem de qualquer um, desconectar ou mover alguém de call.

**Chat**
- Canais de texto e DMs (só entre quem divide algum servidor).
- **Bloquear** alguém (no perfil, no botão direito ou em configurações → bloqueados), igual ao Discord: ninguém manda DM pro outro, quem foi bloqueado não abre conversa nova (e não é avisado), e as mensagens dele nos servidores aparecem recolhidas com "mostrar". **Fechar conversa** (o × na lista de DMs) esconde a DM até chegar mensagem nova.
- Enviar, editar, apagar e responder mensagens. Histórico carregado em páginas ao rolar pra cima.
- Anexos de qualquer tipo: imagem e vídeo com prévia, o resto vira um botão de download. O tamanho máximo é por conta (padrão 100 MB por arquivo e 5 GB no total; o admin muda no painel). Atenção: o túnel do Cloudflare (plano grátis) recusa qualquer pedido com mais de 100 MB (HTTP 413) antes de chegar no servidor, então arquivo acima de ~90 MB precisa ir em partes.
- **Markdown** igual o Discord: `# título`, `## subtítulo`, `-# texto pequeno`, `**negrito**`, `*itálico*`, `__sublinhado__`, `~~riscado~~`, `` `código` ``, blocos ```` ``` ````, `||spoiler||`, `> citação`, listas e `[texto](link)`. A caixa de mensagem tem várias linhas (Shift+Enter quebra linha; seta pra cima edita a sua última mensagem).
- **Menções**: `@` abre a lista de membros; `@everyone` e `@here` avisam todo mundo. Mensagem que te menciona fica destacada.
- **Emojis e reações**: seletor com busca em português (e gírias como `joinha`, `kkk`), `:atalho:` na caixa de mensagem, tom de pele e recentes. Reação em qualquer mensagem.
- **"fulano está digitando…"**
- **Prévia de links**: YouTube (toca ali mesmo), posts do X, imagens/vídeos por link e qualquer site com prévia.
- **Busca** em todo o servidor (ou na DM), sem diferença de acento; `de:nome` filtra por quem escreveu. Clicar num resultado leva até a mensagem.
- **Mensagens fixadas** por canal (alfinete no topo).
- **Não lidas e menções** guardadas no servidor: continuam marcadas depois de recarregar, com contador de menções no canal, no servidor e no título da aba.
- **Notificações do sistema e Web Push** (menções e DMs, todas, ou nenhuma — na aba notificações). Ativação por navegador permite receber com a aba fechada.
- GIFs e stickers do GIPHY.

**Visual e temas**
- Visual no estilo do Discord atual (o padrão é o "Discord escuro").
- **Temas 100% personalizáveis**, cada pessoa com o seu (fica salvo na conta e vale em qualquer PC): todas as cores, **vidro/translúcido** (opacidade, desfoque e saturação dos painéis), imagem de fundo (enviada ou por link) ou degradê, fonte, tamanho do texto, cantos, formato das fotos de perfil, mensagens compactas e até **CSS próprio**.
- 8 temas prontos pra começar (Discord escuro, Meia-noite, Claro, Vidro, Ametista, Neon, Café, Floresta), "meus temas" salvos, e **código do tema** pra mandar pros amigos copiarem.
- Configurações em tela cheia com abas: perfil, temas, chat, acessibilidade, voz, som, câmera, compartilhar tela, notificações e app/versão.
- **Imagens e vídeos**: visualizador com zoom, girar, copiar imagem, miniaturas de tudo que foi enviado no canal e fundo desfocado com a própria imagem; player de vídeo próprio (velocidade, repetir, volume lembrado, tela cheia, prévia sem som ao passar o mouse).

**Calls (voz, câmera e tela)**
- **Quem está falando** fica com o círculo verde em todo lugar: no card da call, na lista de quem está no canal de voz (na barra lateral, mesmo pra quem não entrou) e na sua barra de perfil.
- WebRTC direto entre as pessoas (malha: cada um tem uma conexão com cada outro) ou, com `SFU=livekit`, passando pelo servidor de mídia do PC (ver "Servidor de mídia" abaixo).
- Mutar, ensurdecer e volume de cada pessoa de 0 a 200% (botão direito na pessoa).
- Áudio em qualidade alta: voz em Opus 96 kbps com correção de perda, som da tela em 192 kbps estéreo.
- Supressão de ruído: avançada (DeepFilterNet3, parecida com a Krisp), leve (RNNoise) ou nenhuma.
- Processamento da voz: caixa de som (cancela eco), fone de ouvido (voz mais natural) ou estúdio (nada).
- Ganho do microfone, sensibilidade (corta o mic abaixo de um volume) e "ouvir a si mesmo".
- Compartilhamento de tela com som, com volume próprio, e opção de "parar de assistir" a tela de alguém.

**Soundboard** (igual ao do Discord)
- Cada servidor tem até 48 sons de até ~5 s. No envio, um editor mostra a onda do arquivo (áudio ou vídeo) pra cortar o trecho; o servidor corta e converte pra mp3 com o ffmpeg.
- Na call, o botão de nota musical (ou "sons" na barra da call) abre o seletor com os sons de **todos os seus servidores**: um som de um servidor pode ser tocado na call de outro, se esse outro deixar ("usar sons externos").
- Cada um ouve com o próprio volume (configurações → som → volume do soundboard); botão direito no som = ouvir só você. Ensurdecido não ouve, e silenciar alguém só pra você silencia os sons dele também.

**Mundinho 3D** (canal do tipo "mundinho")
- Uma call que vira uma **cobertura de luxo em 3D com 2 andares** (36 × 24 m: sala de TV com pé-direito duplo e vista da cidade à noite, cozinha, jantar, piano, mezanino com pufes): cada pessoa é um ursinho que anda (WASD ou clique), sobe a escada, senta nos sofás/pufes/banquetas, acena e dança. Câmera em 1ª ou 3ª pessoa (tecla V).
- **TV da sala**: mostra a tela que alguém compartilhou ou um **vídeo do YouTube sincronizado** pra todo mundo. Cada um pode mutar a TV só pra si, mudar o volume ou pôr em tela cheia.
- **Jogos nas mesas** (sentar na cadeira = entrar; quem chega perto assiste; o servidor decide tudo):
  - **Duno** (estilo Uno, até 8) no mezanino, com as cartas em 3D na mão;
  - **21 (blackjack)** em 2 mesas no térreo, com fichas;
  - **xadrez** em 2 mesas no mezanino (clássico, rápido e blitz), com relógio e peças em 3D;
  - **sinuca "par x ímpar"** no meio do térreo, 1×1 ou 2×2: mesa aberta (a primeira bola que cai decide quem é par e quem é ímpar), a 1 é a bola final, e falta derruba a bola de menor número do outro time. A física roda no servidor e todo mundo vê a mesma jogada;
  - **piano** de cauda (tocar pelo teclado, todo mundo ouve).
- A **call é espacial**: você ouve cada um vindo da direção e da distância do boneco (melhor com fone).
- Não pesa pra ninguém: o Three.js e o código 3D só são baixados quando a pessoa abre um mundinho, e ele só desenha enquanto está na tela. Regras de cada jogo, protocolo, cena e próximos passos: [`docs/MUNDINHO.md`](docs/MUNDINHO.md).

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

**Página de admin** (`/admin`, só a conta marcada como admin do site)
- **Visão geral**: números do site, gráficos dos últimos 30 dias (mensagens, pessoas ativas, contas novas), memória/disco/carga do PC, versão, quais serviços estão no ar (e-mail, anti-robô, LiveKit) e quanto espaço cada coisa ocupa.
- **Ao vivo**: quem está online (e jogando o quê) e quem está em cada call.
- **Usuários**: busca e filtros; cada conta abre um painel com e-mail, 2 etapas, servidores, mensagens, anexos e denúncias, e as ações suspender/reativar, deslogar de tudo, senha temporária, limite de anexos e excluir conta.
- **Servidores**, **denúncias** (apagar a mensagem, suspender, resolver, descartar, baixar a prova), **logs do servidor** ao vivo (últimas 3000 linhas, com filtro), **registro** do que cada admin fez e **aviso geral** pra todo mundo conectado.
- Em call, o botão de admin abre a versão rápida (janela por cima do app), pra não cair da call.

**App desktop — dusky Mist 1.0.x** (Rust/Tauri, Linux e Windows): abre direto no site, faz a call pelo Rust no Linux (o WebKitGTK não tem WebRTC), compartilha a tela pela placa de vídeo, mostra o jogo aberto ("jogando X"), o contador de menções, volta sozinho quando o servidor cai e **se atualiza sozinho**. Os amigos instalam pela página **https://dusky.veneno.space/baixar** (com o guia de dependências de cada distro Linux). Detalhes em [`tauri/README.md`](tauri/README.md).

## Como rodar

Precisa do **Node 22 ou mais novo** e do **ffmpeg** (pro bot de música). O `yt-dlp` é baixado e atualizado sozinho na primeira vez.

```bash
npm install
npm start          # servidor + túnel do Cloudflare (dusky.veneno.space)
npm run start:local  # só o servidor, em http://localhost:3000
npm run dev          # só o servidor, reiniciando sozinho a cada arquivo salvo
```

O banco SQLite é criado sozinho na primeira vez (`server/db/dusky.db`), a partir de `server/db/schema.sql` e das migrações leves em `server/db/index.js`.

`bcrypt` e `better-sqlite3` são compilados na instalação. O npm novo bloqueia isso por padrão: os dois já estão liberados em `allowScripts` no `package.json`. Se trocar a versão do Node e o servidor reclamar de `NODE_MODULE_VERSION`, roda `npm rebuild bcrypt better-sqlite3`.

### Túnel do Cloudflare

O `npm start` sobe o servidor e o `cloudflared` juntos. Com o `.env` configurado pro túnel nomeado, o site fica no endereço fixo e o terminal mostra `túnel no ar: https://dusky.veneno.space` quando conecta. O site só fica no ar enquanto esse terminal estiver aberto.

As credenciais do túnel ficam em `~/.cloudflared` (fora do projeto). Pra montar em outro PC:

```bash
cloudflared tunnel login
# ou copia ~/.cloudflared/<id>.json deste PC, ou cria outro túnel:
cloudflared tunnel create dusky-veneno
cloudflared tunnel route dns dusky-veneno dusky.veneno.space
```

O túnel deste PC ainda se chama `didiscord-veneno` (nome de antes do projeto virar dusky; não precisa trocar). Ele atende **os dois endereços**: `dusky.veneno.space` (o oficial) e `didiscord.veneno.space` (o antigo, que precisa continuar no ar pros apps Electron já instalados e pro atualizador deles, que lê `/downloads/latest*.yml` de lá). Basta cada endereço ter uma rota DNS pro mesmo túnel:

```bash
cloudflared tunnel route dns didiscord-veneno dusky.veneno.space   # o antigo já tem
```

`CLOUDFLARE_TUNNEL_HOSTNAME` aceita os dois separados por vírgula (só muda o que aparece no terminal). Com `LEGACY_HOST_REDIRECT=1` no `.env`, quem abre o endereço antigo num navegador comum é mandado pro novo (apps desktop, `/downloads`, `/api` e mídia continuam no antigo).

Nunca rode o servidor em dois PCs com o mesmo túnel ao mesmo tempo: o Cloudflare divide as visitas entre os dois, cada um com o próprio banco.

Sem `CLOUDFLARE_TUNNEL_MODE` no `.env`, ele volta pro túnel rápido: um endereço aleatório `*.trycloudflare.com`, que muda a cada reinício.

Neste PC o `npm start` roda como serviço do systemd (`/etc/systemd/system/dusky.service`, `Restart=always`, com `User=veneno` e `WorkingDirectory` na pasta do projeto). O serviço deve ter `Environment=NODE_ENV=production` junto das outras linhas `Environment=`: nada no código do dusky lê essa variável, mas o Express sim (sem ela ele roda em modo de desenvolvimento). Depois de mexer no arquivo: `sudo systemctl daemon-reload && sudo systemctl restart dusky.service`. Se o processo cair por uma exceção não tratada, ele sai com código 1 de propósito e o systemd religa em 5 s.

Alternativa sem Cloudflare: `deploy/setup-vm.sh` prepara uma VM Ubuntu com Node, ffmpeg, systemd e Caddy (HTTPS automático).

### Variáveis de ambiente (`.env`, fora do git)

Todas são opcionais: sem uma delas, a função correspondente cai num modo mais simples ou fica desligada.

| Variável | Pra quê | Sem ela |
|---|---|---|
| `PORT` | porta do servidor | `3000` |
| `SESSION_SECRET` | assina o cookie de login — **obrigatória na internet** (`openssl rand -hex 32`) | usa uma chave padrão que está no código (inseguro) |
| `RESEND_API_KEY`, `MAIL_FROM` | envio de e-mail pelo [Resend](https://resend.com) (códigos, avisos de segurança, denúncias). Com ela, **todo mundo precisa confirmar um e-mail** | códigos só aparecem no log (`[mail]`) e o e-mail não é cobrado |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | anti-robô no cadastro ([Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)) | cadastro sem a verificação |
| `CONTACT_EMAIL` | e-mail de contato nas páginas de termos e privacidade | "fale com o admin dentro do dusky" |
| `UPLOAD_MAX_MB`, `UPLOAD_QUOTA_MB` | tamanho máximo de um anexo e espaço total por conta | 100 MB e 5 GB |
| `SITE_ADMINS` | conta(s) marcada(s) como admin do site no primeiro boot (separadas por vírgula) | `veneno` |
| `METERED_DOMAIN`, `METERED_SECRET_KEY` | servidor TURN do [Metered](https://www.metered.ca/), pra calls entre redes difíceis (4G, NAT) | só STUN (sem relay TURN: call entre redes difíceis pode não conectar) |
| `GIPHY_API_KEY` | busca de GIFs e stickers | busca de GIF desligada |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | links do Spotify no `/play` | só YouTube e busca por nome |
| `CLOUDFLARE_TUNNEL_MODE` | `nomeado` = túnel com endereço fixo | túnel rápido (endereço aleatório) |
| `CLOUDFLARE_TUNNEL_NAME` / `CLOUDFLARE_TUNNEL_TOKEN` | qual túnel nomeado usar (pelo nome em `~/.cloudflared`, ou por token do painel) | — |
| `CLOUDFLARE_TUNNEL_HOSTNAME` | endereço mostrado no terminal quando o túnel sobe | não mostra |
| `YTDLP_PATH`, `FFMPEG_PATH` | usar um `yt-dlp`/`ffmpeg` específico | `yt-dlp` baixado pelo bot e `ffmpeg` do sistema |

## Notificações com o site fechado

Em **configurações → notificações → com o site fechado**, clique em **ativar neste aparelho** e autorize no navegador. O nível abaixo (menções/DMs, todas, nenhuma) também controla o push; “nenhuma” pausa os avisos. Desativar remove a inscrição deste navegador. Sair da conta também cancela essa inscrição.

Requer HTTPS (localhost serve para desenvolvimento), navegador com Web Push e execução em segundo plano permitida pelo sistema. Fechar a aba funciona; encerrar totalmente o navegador ou bloquear sua execução em segundo plano pode impedir entrega. O app desktop usa as notificações da janela; o botão de Web Push é para navegadores compatíveis. Provedores aceitos: Google/Chromium, Mozilla e Apple.

As chaves VAPID são geradas uma vez e persistidas em `app_secrets` no SQLite, fora do Git. Inclua o banco nos backups para preservar inscrições. `WEB_PUSH_SUBJECT` opcional muda o endereço público de contato VAPID (padrão: `https://dusky.veneno.space`). O worker (`public/sw.js`) não faz cache de páginas privadas. O push leva apenas IDs; a leitura do conteúdo exige a sessão e as permissões atuais. Inscrições expiradas (404/410) são removidas. Senha redefinida, suspensão ou perda de acesso impedem novos avisos daquele conteúdo.

Não exige chave externa nem alteração manual no `.env`. Depois de atualizar, rode `npm install`, reinicie o servidor e recarregue a página. A migração do banco é automática e conserva o histórico.

Referências de implementação: [Web Push](https://github.com/web-push-libs/web-push) e [Service Worker: showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).

## Verificação

`npm test` executa os testes (`tests/*.test.js`) com SQLite em memória: permissões, isolamento entre servidores, categorias e a ordem da lateral (`channel-layout`), configurações do servidor, push, decorações e efeito no nome, contas (e-mail, 2 etapas, esqueci a senha, exportar e excluir conta), denúncias, a página de admin, e as regras do mundinho e de cada jogo (Duno, 21, xadrez com perft e sinuca, com física e faltas). Nenhum teste usa o banco real. `DUSKY_DB_PATH` permite apontar uma instância de desenvolvimento para outro banco (o padrão continua `server/db/dusky.db`; o nome antigo `DIDISCORD_DB_PATH` também vale, e um `didiscord.db` antigo é renomeado sozinho pra `dusky.db` na primeira vez). A entrega por um serviço de push real depende da ativação no navegador; os testes verificam assinatura/criptografia e o comportamento do worker sem enviar avisos externos.

## Estrutura do projeto

```
dusky/
├── server/
│   ├── index.js            # liga o Express, a sessão, as rotas, o HTTP e o WebSocket
│   ├── config.js           # chaves de serviços externos lidas do .env
│   ├── access.js           # TODAS as regras de "quem pode ver/fazer o quê" (servidor, canal, DM, cargos)
│   ├── realtime.js         # WebSocket: chat ao vivo, presença, estado de voz, sinalização WebRTC, AFK, soundboard
│   ├── audit.js            # registro de auditoria (quem fez o quê em cada servidor)
│   ├── soundboard.js       # regras do soundboard e corte/conversão do som com ffmpeg
│   ├── world.js            # mundinho 3D: spawn, limites e assentos (lê public/world/scenes/*.json)
│   ├── games/              # jogos das mesas do mundinho: duno.js, blackjack.js, chess.js, pool.js (sinuca, com a física)
│   ├── decor.js            # decorações do perfil (presets + catálogo do Discord)
│   ├── nameStyle.js        # efeito no nome (validação)
│   ├── chatExtras.js       # extras do chat (menções, reações, fixadas)
│   ├── push.js             # Web Push (chaves VAPID, envio, limpeza)
│   ├── sfu/livekit.js      # servidor de mídia opcional (LiveKit)
│   ├── upload.js           # multer: avatar, banner, ícone, anexos
│   ├── wsTickets.js        # ticket de uso único pra autenticar o WebSocket
│   ├── mail.js, authCodes.js, totp.js  # e-mail (Resend), códigos de 6 dígitos e app autenticador (2 etapas)
│   ├── turnstile.js        # anti-robô do cadastro (Cloudflare Turnstile)
│   ├── accountDeletion.js  # excluir conta (LGPD): apaga os dados pessoais e anonimiza
│   ├── reports.js          # denúncias: motivos e prova guardada (server/reports-evidence/, fora do git)
│   ├── userPrivate.js      # campos que nunca saem pra outras pessoas (e-mail, segredos das 2 etapas…)
│   ├── logBuffer.js, adminLog.js  # últimas linhas de log e registro de ações do admin (página /admin)
│   ├── middleware/auth.js  # requireAuth: exige login (e derruba conta suspensa / sessão antiga)
│   ├── db/                 # schema.sql, migrações (index.js), consultas de mensagem
│   ├── bots/musicBot/      # bot de música: comandos, fila, yt-dlp → ffmpeg → mp3, Spotify
│   └── routes/
│       ├── auth.js         # cadastro, login (nick ou e-mail), 2 etapas no login, confirmar/trocar e-mail, esqueci a senha, /me
│       ├── account.js      # 2 etapas (ligar/desligar, códigos de recuperação), baixar meus dados, excluir conta
│       ├── reports.js      # denunciar mensagem ou pessoa
│       ├── servers.js      # servidores, canais (criar, ordem da lateral), configurações, membros, banimentos, convites, cargos, auditoria, moderação de voz
│       ├── soundboard.js   # sons do soundboard (lista de todos os servidores + enviar/editar/apagar)
│       ├── channels.js     # editar/apagar canal, quem está em qual call
│       ├── categories.js   # criar/editar/apagar categoria
│       ├── push.js         # inscrição de Web Push
│       ├── messages.js     # histórico, enviar (texto, anexo, gif), editar, apagar
│       ├── dms.js          # conversas diretas
│       ├── activity.js     # não lidas (com menções) e busca de mensagens
│       ├── embeds.js       # prévia de links (busca a página e devolve título/imagem)
│       ├── downloads.js    # página /baixar, /downloads/* e versão atual do app desktop
│       ├── invites.js      # prévia e aceite de convite
│       ├── users.js        # perfil de outra pessoa, contatos
│       ├── profile.js      # editar o próprio perfil, senha, avatar, banner, tema (e imagem de fundo dele)
│       ├── admin.js        # página /admin: números, sistema, ao vivo, contas, servidores, denúncias, logs, registro
│       ├── musicbot.js     # stream de áudio e estado do bot
│       ├── rtc.js          # servidores STUN/TURN pro WebRTC
│       ├── giphy.js        # proxy do GIPHY (a chave nunca vai pro navegador)
│       ├── ws.js           # emite o ticket do WebSocket
│       ├── bots.js         # lista de bots (estática)
│       └── server.js, members.js  # restos do modelo antigo de um servidor só (não estão ligados)
├── public/
│   ├── login.html, app.html, admin.html  # entrar/criar conta, o app, a página de admin (js/admin.js)
│   ├── termos.html, privacidade.html     # termos de uso e política de privacidade
│   ├── css/                # theme.css (variáveis e componentes base), um arquivo por área,
│   │                       #   design.css (o visual atual, por cima de tudo) e media.css (imagens/vídeos)
│   ├── js/themes.js        # motor de temas: aplica as variáveis, temas prontos, editor da aba "temas"
│   ├── js/app/             # o site inteiro (chat, servidores, perfil, calls, tela, configurações), em 32
│   │                       #   arquivos por assunto, carregados em ordem — o mapa está em js/app/README.md
│   ├── js/decor-catalog.js, js/decor-picker.js  # decorações do Discord (tocar efeitos/placas, galeria)
│   ├── decor/              # catálogo das decorações (catalog.json/.js); as mídias em decor/media/ ficam fora do git
│   ├── js/realtime.js      # cliente WebSocket (reconexão, eventos)
│   ├── js/markdown.js      # Markdown do chat (monta os elementos direto, sem innerHTML)
│   ├── js/emoji.js         # seletor de emoji e busca por :atalho:
│   ├── baixar.html         # página de instalação do app desktop
│   ├── js/auth.js          # tela de login/cadastro
│   ├── world/              # mundinho 3D (módulos ES, carregados sob demanda): world.js, avatar.js, props.js,
│   │                       #   tv.js, piano.js, scenes/penthouse.json e games/ (duno, blackjack, chess, pool)
│   ├── vendor/             # DeepFilterNet3 e RNNoise (supressão de ruído, em WebAssembly) e Three.js
│   └── uploads/            # arquivos enviados pelo pessoal (fora do git)
├── tauri/                  # app desktop dusky Mist (Rust/Tauri) — ver tauri/README.md
├── native/                 # auxiliares nativos do app desktop: screencast (Go) e audiocap (C++, Windows)
├── docs/                   # MUNDINHO.md (plano e status do 3D e dos jogos), decor-catalog.md
├── tests/                  # npm test (SQLite em memória)
├── scripts/start.js        # npm start: servidor + túnel
├── scripts/import-decor-catalog.py  # importa/restaura o catálogo de decorações
└── deploy/setup-vm.sh      # instalação numa VM Ubuntu (alternativa ao túnel)
```

## Modelo de dados

- **`users`**: contas. E-mail (`email`, `email_pending`), 2 etapas (`totp_*`, `twofa_email`, `recovery_codes`), `terms_accepted_at`, `deleted_at` (conta excluída). Perfil, `theme_json` (o tema e os "meus temas" da pessoa), `name_style` (efeito no nome), `nameplate`/`avatar_deco`/`profile_fx` (decorações), `is_site_admin`, suspensão (`banned_at`) e `session_version` (sobe quando a senha é redefinida, pra derrubar sessões antigas).
- **`servers`**, **`server_members`**, **`invites`**: servidores, quem está em cada um, e convites (usos, validade).
- **`channels`**: canais de texto/voz de um servidor, com `category_id` e `position` (a ordem da lateral) e `world_scene` (preenchido = mundinho 3D). `server_id` nulo = DM, com os 2 participantes em **`dm_members`**.
- **`channel_categories`**: categorias de cada servidor (nome e posição).
- **`user_blocks`**: quem bloqueou quem (regras em `server/access.js`). `dm_members.hidden_at` guarda a DM que a pessoa fechou (volta com mensagem nova).
- **`messages`**: mensagens, com anexo, resposta (`reply_to_id`), edição, e `embed_json` pras respostas do bot de música.
- **`roles`**, **`member_roles`**, **`channel_role_access`**: cargos, quem tem cada um, e quais cargos veem/entram em cada canal restrito.
- **`channel_reads`**: até qual mensagem cada pessoa leu cada canal (as não lidas).
- **`message_mentions`**, **`message_reactions`**: quem cada mensagem menciona (`user_id` 0 = @everyone) e as reações. Fixada é `messages.pinned_at`.
- **`server_bans`**, **`audit_log`**, **`soundboard_sounds`**: banimentos, registro de auditoria e sons do soundboard. As configurações novas do servidor (banner, descrição, canal do sistema, AFK, cargo de entrada, permissões do @everyone) são colunas de **`servers`**; mensagens do sistema usam `messages.system_type`.
- **`messages_fts`**: índice de busca (FTS5), mantido em dia por gatilhos.
- **`voice_state`**: resto antigo, não é mais usada (é esvaziada no boot). Quem está em qual call fica só na memória do `realtime.js`: reiniciar o servidor derruba as calls e cada um entra de novo.
- **`push_subscriptions`**, **`app_secrets`**: inscrições de Web Push e as chaves VAPID.
- **`auth_codes`**: códigos de 6 dígitos mandados por e-mail (guardados só como hash, valem 15 min).
- **`reports`**: denúncias, com uma cópia da mensagem/perfil denunciado (`snapshot_json`) e o arquivo da prova (`evidence_file`).
- **`site_admin_log`**: o que o admin do site fez (página /admin → registro).
- **`server_settings`**: resto do modelo antigo de um servidor só (migrado pra `servers` automaticamente).
- Os jogos do mundinho (partidas, fichas do 21) ficam só em memória no servidor: reiniciar zera.

## Como o tempo real e as calls funcionam

1. O navegador pede um **ticket** de uso único (`GET /api/ws/ticket`) e abre o WebSocket em `/ws?ticket=...`.
2. Cada evento (mensagem nova, alguém entrou na call, perfil mudou...) vai só pra quem pode ver aquilo. As regras ficam todas em `server/access.js`.
3. As calls são **WebRTC direto entre as pessoas**. O servidor só repassa a sinalização (ofertas, respostas, candidatos ICE) entre quem está na mesma call. Voz, câmera e tela não passam por ele.
   - Cada conexão tem **4 canais fixos, sempre nessa ordem**: 0 microfone, 1 câmera, 2 tela, 3 som da tela. Quem recebe identifica cada faixa pela posição. Por isso todo mundo numa call precisa estar com a mesma versão dos arquivos de `public/js/app/` (recarregar a página resolve).
   - A qualidade do Opus é definida no SDP que cada lado manda ("é assim que eu quero receber"). Quem estiver com uma versão antiga do site recebe o som na qualidade padrão do WebRTC (32 kbps mono).
4. A credencial do TURN do Metered fica guardada por ~50 min (`server/routes/rtc.js`), porque o plano grátis tem um limite total de credenciais. O site pede uma nova ao entrar na call, ao começar a compartilhar a tela e ao reconectar.

## Servidor de mídia (SFU) — as calls passando pelo PC do servidor

Por padrão as calls são em malha (cada pessoa ligada direto em cada outra, item 3 acima). Com `SFU=livekit` no `.env`, o servidor sobe um [LiveKit](https://github.com/livekit/livekit) ao lado do site e as calls passam por ele: cada pessoa manda voz, câmera e tela **uma vez** pro servidor, e ele repassa pros outros. É de graça e roda só neste PC.

**Pra ligar:**

1. No roteador, abra pro PC do servidor as portas **UDP 7882** (a mídia passa por ela) e **TCP 7881** (reserva pra quem tem UDP bloqueado). Se o PC tiver firewall, libere as duas nele também.
2. Ponha `SFU=livekit` no `.env`.
3. Reinicie o `npm start`. Na primeira vez ele baixa o `livekit-server` (~20 MB, em `server/sfu/bin/`, fora do git) e mostra `[sfu] no ar` quando estiver pronto.

**Pra voltar pra malha:** tire a linha (ou ponha `SFU=off`) e reinicie. Se o LiveKit não subir ou cair, as calls novas também entram em malha sozinhas.

Como funciona:

- `server/sfu/livekit.js` baixa, configura e mantém o LiveKit de pé, gera a chave dele uma vez (`server/sfu/data/`, fora do git) e emite o ingresso de cada pessoa (`GET /api/rtc/sfu?channelId=`), só pra quem pode entrar naquela call.
- A **sinalização** do LiveKit passa pelo próprio site, em `/livekit` (então também passa pelo túnel do Cloudflare). O **áudio e o vídeo não passam pelo túnel**: vão direto pro IP público do PC, pelas portas acima. Por isso elas precisam estar abertas, e não funciona atrás de CGNAT.
- O IP público é descoberto sozinho a cada início. Quem está na mesma rede do servidor (ou no próprio PC) conecta pelo IP interno.
- Quem está na call, mudo/surdo, "falando", mover e desconectar continuam pelo WebSocket do site, iguais nos dois modos. Em `public/js/app/21-call-sfu.js`, o código cuida de publicar e receber as faixas; o resto do código de call é compartilhado.
- **Todo mundo numa call precisa estar no mesmo modo.** Quem entrou enquanto o LiveKit estava fora (em malha) não ouve quem entrou depois que ele voltou: é só sair e entrar de novo.
- A tela **pela placa de vídeo** (app desktop 0.5.2 ou mais novo) também passa pelo servidor: o auxiliar entra na sala como um participante à parte (`tela-<id da conta>`) e publica o vídeo já codificado, então sai uma cópia só do PC de quem compartilha (`native/screencast/sfu.go`). Com um app mais antigo, ou se o servidor de mídia não responder, o auxiliar volta a mandar direto pra cada pessoa. O som da tela sempre vai pelo site.

| Variável | Pra quê | Sem ela |
|---|---|---|
| `SFU` | `livekit` liga o servidor de mídia | calls em malha |
| `LIVEKIT_UDP_PORT`, `LIVEKIT_TCP_PORT` | portas da mídia (as que abrem no roteador) | `7882` e `7881` |
| `LIVEKIT_NODE_IP` | IP público fixo, se a descoberta automática falhar (`local` = só rede interna, pra teste) | descobre sozinho |
| `LIVEKIT_HTTP_PORT` | porta interna da sinalização (só `127.0.0.1`) | `7880` |
| `LIVEKIT_VERSION`, `LIVEKIT_PATH` | outra versão, ou um `livekit-server` já instalado | versão fixa, baixada sozinha |

## App desktop

O app pro computador é o dusky Mist (pasta `tauri/`) — como rodar, publicar versão (`npm run release`), atualização automática e aceleração de hardware estão em [`tauri/README.md`](tauri/README.md). O app antigo (Electron) foi aposentado.

### "Jogando X" (rich presence)

O app descobre qual jogo está aberto no computador (`tauri/src-tauri/src/presence.rs`, a cada ~15 s) e avisa o site, que mostra "jogando X" na lista de membros e no cartão de perfil de quem divide servidor ou DM com a pessoa. No navegador não tem detecção.

- Reconhece sozinho os jogos da Steam (pelo caminho `steamapps/common/...`, com o nome vindo do appmanifest) e uma lista pequena de jogos conhecidos de fora dela. Os outros a pessoa cadastra em **configurações → app → atividade → adicionar jogo**, escolhendo o programa aberto e o nome.
- Dá pra desligar no mesmo lugar ("mostrar o que estou jogando"). Desligado, o app nem lê os programas abertos.
- A lista de programas nunca sai do app: pro site vai só o nome do jogo. No servidor fica só em memória (`activities` em `server/realtime.js`) e some quando o app fecha.
- No Linux lê `/proc`; no Windows usa um `Get-Process` do PowerShell a cada 20 s. macOS ainda não detecta.

### Compartilhamento de tela pela placa de vídeo

Pelo navegador, a tela é codificada no processador uma vez **por pessoa assistindo**: em 1080p60 isso era ~1 núcleo por pessoa, derrubando o fps dos jogos. No app desktop, a tela é codificada **uma vez só, na placa de vídeo**, e o auxiliar `native/screencast` (em Go, com a biblioteca WebRTC Pion) manda o mesmo vídeo pra cada um.

| Sistema | Captura e codificação |
|---|---|
| Linux X11, Windows | ffmpeg: NVENC → VA-API/QSV/AMF → x264 (processador), o primeiro que funcionar |
| Linux Wayland (Hyprland, GNOME, KDE) | o auxiliar abre o portal de captura do sistema, recebe o vídeo pelo PipeWire, e o GStreamer codifica: `nvh264enc` → `vah264lpenc`/`vah264enc` → `x264enc` |
| macOS, ou sem nada disso instalado | cai pro jeito do navegador |

Medido numa RTX 3060 no Hyprland: 1080p60 a ~8% de um núcleo, e 720p60 com a redução de tamanho feita na própria placa. Um quadro-chave sai a cada 1 s, pra quem entra no meio começar rápido.

No Wayland precisa de `gst-plugin-pipewire` e `gst-plugins-bad` (NVENC/VA-API); sem placa de vídeo compatível, também `gst-plugins-ugly` (x264).

Se a conexão da tela com alguém cair, ela é refeita sozinha, com credencial TURN nova.

### Som da tela

O WebView não sabe capturar o som de um app só, então cada sistema tem um captador próprio, que manda o áudio cru pro site:

- **Linux** (`tauri/src-tauri/src/audio/linux.rs`): um `pw-record` desligado de tudo, e o app liga nele (com `pw-link`) só as saídas de som certas.
  - Compartilhando uma janela: só o som do processo daquela janela.
  - Compartilhando a tela inteira: todo o som do PC, menos o do próprio dusky (senão quem assiste ouviria a própria voz de volta).
  - No Wayland o sistema não diz de qual app é a janela escolhida, então o som é escolhido antes, num seletor do dusky (tudo, um app específico, ou nada).
- **Windows** (`native/audiocap.cpp`): WASAPI Process Loopback, com a mesma regra (incluir só o app da janela, ou excluir o dusky).

### Recompilar os auxiliares

Os executáveis prontos ficam em `native/bin/` (dentro do git, porque sem eles não dá pra gerar o app).

```bash
# compartilhamento de tela (Go 1.26+; usa a biblioteca do LiveKit pra mandar a tela pelo servidor de mídia)
cd native/screencast
CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o ../bin/dusky-screencast .
GOOS=windows CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o ../bin/dusky-screencast.exe .

# som da tela no Windows (precisa do zig)
native/build-cross.sh
```

## Coisas a saber antes de mexer

- **JavaScript puro, sem TypeScript, framework ou bundler**, de propósito.
- **O código do site fica em `public/js/app/`**, dividido por assunto. São scripts comuns que dividem o mesmo escopo e carregam em ordem; as regras pra mexer (ordem, nomes globais, `?v=`) e o mapa de onde está cada coisa estão em [`public/js/app/README.md`](public/js/app/README.md).
- **`server/access.js` decide tudo sobre permissão.** Rota nova ou evento novo de tempo real deve perguntar pra ele, nunca refazer a regra na mão.
- **`.env`, banco e uploads nunca vão pro git** (ver `.gitignore`). Chave nova no `config.js` deve entrar na tabela de variáveis acima.
- Os comentários do código estão em português e explicam o porquê das decisões que não são óbvias. Vale ler antes de refatorar.
- **Cores, fontes e cantos sempre por variável** (`var(--accent)`, `var(--bg-chat)`, `var(--text-normal)`…, lista no topo de `css/theme.css`), nunca cor fixa, senão o tema de cada um não pega. Os painéis usam as variáveis transparentes (`--bg-sidebar`, `--bg-chat`) e o que precisa ser sempre opaco (menus, campos) usa as `--bg-solid-*`.
- Os arquivos estáticos vão com `Cache-Control: no-cache`: o navegador guarda, mas confere com o servidor (ETag) toda vez antes de usar, então ninguém fica com o código do site velho depois de uma mudança e o que não mudou volta como 304, sem baixar de novo. As exceções são `public/vendor/` (30 dias) e `public/decor/media/` (1 ano). Anexos do chat vão com `private, no-cache`: a permissão é conferida em todo pedido, só o corpo não é baixado de novo.

## Próximos passos

Pra depois:
- **Assinar o instalador do Windows** (tirar o aviso de app desconhecido) — de graça pela SignPath Foundation, que atende projetos open source.
- **Compartilhar janela no Wayland** às vezes cai depois de alguns segundos (erro do GStreamer com janela de tamanho "quebrado", ex.: 1900×1006); a tela inteira funciona.
- **Processos do WebKit que ficam rodando** depois de fechar o app desktop no Linux (ocupam RAM até reiniciar).
- Mundinho: efeito na branca da sinuca, som das tacadas, mais jogos (truco, poker, damas), personagens com animação de verdade, mais cenas. Lista completa em [`docs/MUNDINHO.md`](docs/MUNDINHO.md).

## Licença

O dusky é software livre: [GNU Affero General Public License 3.0 ou posterior](LICENSE) (AGPL-3.0-or-later). Dá pra usar, estudar, mudar e redistribuir; quem rodar uma versão modificada como serviço pra outras pessoas precisa oferecer o código dessa versão pra elas (o site já tem o link "código-fonte" no rodapé).

Partes de terceiros incluídas, cada uma com a sua licença:

| o quê | onde | licença |
|---|---|---|
| LiveKit (cliente web) | `public/vendor/livekit/` | Apache-2.0 |
| DeepFilterNet3 | `public/vendor/deepfilternet3/` | MIT / Apache-2.0 |
| RNNoise (web-noise-suppressor) | `public/vendor/web-noise-suppressor/` | MIT / BSD |
| Three.js | `public/vendor/three/` | MIT |
| emojibase (dados de emoji) | `public/vendor/emoji/` | MIT |
| bibliotecas do servidor (npm) | `package.json` | MIT, exceto web-push (MPL-2.0) |
| FFmpeg (só no instalador do Windows) | baixado por `tauri/scripts/fetch-ffmpeg.js` | GPL-3.0 — build "win64-gpl" 8.1.3 do BtbN (github.com/BtbN/FFmpeg-Builds); o código-fonte do FFmpeg está em https://ffmpeg.org/download.html |
| LiveKit server, yt-dlp, ffmpeg do bot | baixados na primeira vez, fora do git | Apache-2.0, Unlicense, LGPL/GPL |
