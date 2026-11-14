# Mundinho 3D — plano, decisões e status

> Documento de passagem de bastão. Se você é uma IA (ou pessoa) continuando este trabalho, leia
> tudo antes de mexer: a seção **Status** diz o que já está feito e o que falta, e a seção
> **Regras do projeto** resume o que o README da raiz e `public/js/app/README.md` exigem.

## A ideia

Um tipo especial de canal de voz: em vez da grade de participantes, a call vira um **mundinho 3D**
(uma sala) onde cada pessoa é um bonequinho. A **call é espacial**: você ouve cada pessoa vindo da
direção e da distância em que o boneco dela está. Dá pra **andar**, **sentar** (em sofás e
poltronas de verdade no cenário), **levantar** e fazer **emotes** (acenar, dançar).

Depois (fora do escopo da primeira etapa): **atividades/jogos** nas mesas — xadrez primeiro, depois
um jogo de cartas tipo Uno (com nome/visual próprios), truco, etc. — e uma **TV** que mostra a tela
compartilhada. Ver "Próximas etapas".

## Regra de ouro: não pesar o dusky

- Nada do 3D é baixado por quem não entra num mundo. O Three.js (`public/vendor/three/0.170.0/`) e
  o código do mundo (`public/world/`) só são carregados com `import()` dinâmico quando a pessoa abre
  um canal-mundo em que está na call.
- `public/vendor/` fica 30 dias em cache (ver `server/index.js`); `public/world/` é servido sem cache
  como o resto do site — por isso os imports internos de `public/world/` levam `?v=N` (suba junto
  com o `?v=` do `app.html`).
- O mundo **só desenha quando está visível** (aba visível, call view aberta). Sem foco na janela,
  limita o fps (o pessoal joga com o dusky aberto: não pode roubar GPU do jogo).
- **F9** no mundinho liga um contador de fps (fps, pior quadro, placa do WebGL, escala de pixels,
  foco e, no app, a aceleração de hardware) — pra comparar app e navegador (ver tauri/README.md).
- Visual low-poly feito em código (sem modelos .glb por enquanto), sem sombras em tempo real,
  `pixelRatio` limitado.

## Arquitetura

### Canal-mundo
- Um canal-mundo é um **canal de voz** com `channels.world_scene` preenchido (ex.: `'lounge'`).
  NULL = canal de voz normal. (A coluna `type` tem um CHECK `text|voice` no schema antigo e SQLite
  não altera CHECK — por isso é uma coluna nova, não um tipo novo.)
- Toda a call continua igual: malha (`22-call-mesh.js`) ou LiveKit (`21-call-sfu.js`),
  supressão de ruído, soundboard, mudo/surdo, permissões de canal. O mundo é só **outra forma de
  mostrar** a mesma call + posições sincronizadas.
- Criar: modal "criar canal" ganhou a opção **mundinho** → `POST /api/servers/:id/channels`
  com `type: 'world'` (o servidor grava `type='voice'`, `world_scene='lounge'`).

### Cenas
- Definição de cada cena em `public/world/scenes/<nome>.json` — **lida pelo servidor e pelo site**:
  limites (`bounds`), ponto de nascer (`spawn`), assentos (`seats`: id, posição, rotação, altura),
  obstáculos (`colliders`, retângulos no chão) e móveis (`props`, desenhados por
  `public/world/props.js`).
- Servidor: `server/world.js` carrega as cenas, sorteia o spawn, valida movimento (limites) e
  assentos (um por pessoa, ninguém senta em cima de ninguém).

### Protocolo (WebSocket, `server/realtime.js`)
- `voice_join` num canal-mundo → o servidor cria `state.world = { x, z, ry, action, seat }` no
  spawn. Vai junto em `voice_channel_state.participants[].world`, em `voice_channel_state.self`
  (o meu) e em `voice_user_joined.world`.
- Cliente → servidor: `world_move { x, z, ry, action, seat }`
  - `action`: `'stand' | 'walk' | 'sit' | 'wave' | 'dance'`
  - `seat`: id do assento quando `action === 'sit'`, senão `null`
  - limitado a ~20/s por conexão; posição presa aos `bounds`; sentar exige assento livre — senão o
    servidor responde `world_correction` com o estado válido.
- Servidor → os outros da MESMA call: `world_state { channelId, userId, x, z, ry, action, seat }`.
  (Não vai pra quem só está vendo o canal na lateral.)

### Site
- `public/js/app/27-world.js` (script comum, carrega sempre, é pequeno): estado das posições,
  envio throttled, áudio espacial e montar/desmontar o renderizador.
  `isWorldChannel(ch)`, `worldParticipants`, `myWorld`, `syncWorldView()` (chamado em
  `renderCallParticipants()`), `updateSpatialAudio()`.
- `public/world/world.js` (módulo ES, carregado sob demanda): `createWorld(container, api)` monta
  Three.js, cena, bonecos, câmera em 3ª pessoa, controles (WASD/setas, clique no chão pra andar,
  clique no assento pra sentar, arrastar pra girar a câmera, roda pra zoom), etiquetas de nome com
  avatar e anel verde de quem fala (HTML por cima do canvas), HUD de emotes.
  Devolve `{ setParticipants, applyRemote, applySelf, setSpeaking, setVisible, destroy }`.
- `public/world/avatar.js`: bonequinho low-poly procedural (corpo, cabeça, braços, pernas) com
  animações procedurais de andar, sentar, acenar e dançar. Cor = `accent_color` da pessoa.
- `public/world/props.js`: sofá, poltrona, mesa de centro, tapete, planta, luminária, TV, estante.

### Áudio espacial
- Cada pessoa da call já tem um grafo Web Audio paralelo (`ensurePeerBoostGraph`, em
  `18-call-audio.js`). Numa call-mundo, o `<audio>` da pessoa fica mudo e **todo** o som passa pelo
  grafo: `fonte → ganho (volume 0–200%) → PannerNode (HRTF) → limitador → saída`.
- O `listener` do `audioCtx` acompanha a posição/direção do meu boneco; o `PannerNode` de cada um
  acompanha o boneco dele. Atenuação `inverse`, `refDistance` ~1.5 m, `maxDistance` ~22 m.
- Som da tela compartilhada e bot de música **não** são espaciais (por enquanto).

## Regras do projeto (resumo)
- JavaScript puro, sem framework, sem bundler. Comentários em **português** explicando o porquê.
- `public/js/app/*.js` são scripts comuns no MESMO escopo, carregados em ordem pelo `app.html`;
  nomes no topo são globais — procure antes de criar (`grep -rn "function nome" public/js/app/`).
  Mudou algo ali → suba o `?v=` de todos no `app.html`.
- Cores sempre por variável CSS do tema (`var(--accent)`…), nunca fixas (no 3D, as cores dos
  móveis podem ser fixas; as da interface por cima, não).
- Permissão de verdade é sempre do servidor (`server/access.js`).
- Testes: `npm test` (SQLite em memória, nunca o banco real). Pra testar com navegador use outro
  banco: `DUSKY_DB_PATH=/tmp/x.db PORT=3100 node server/index.js`.
  **Nunca abra o banco real (`server/db/dusky.db`) com o servidor de produção rodando.**

## Status

Legenda: [x] feito · [ ] falta · [~] parcial

### Etapa 1 — mundinho + call espacial ✅ (feita, testada com 2 pessoas no navegador)
- [x] Doc (este arquivo)
- [x] Three.js vendorizado em `public/vendor/three/0.170.0/three.module.min.js` (MIT, arquivo único)
- [x] `channels.world_scene` + criar canal tipo mundinho (modal "criar canal" e rota)
- [x] `server/world.js` + cena `public/world/scenes/lounge.json` (sala com sofá, poltronas,
      mesa de centro, TV, estante, plantas, cantinho com sofá e mesa redonda com 4 cadeiras)
- [x] Realtime: spawn no join, `world_move` validado (limites, assento livre, ~20/s), `world_state`
      só pra quem está na call, `world_correction` quando o servidor muda algo
- [x] `27-world.js` (cola no site) + realtime renomeado pra `28-realtime.js`
- [x] `public/world/world.js`, `avatar.js`, `props.js` + `public/css/world.css`
- [x] Áudio espacial (PannerNode HRTF por pessoa; ouvido segue a câmera)
- [x] Ícone de cubinho na lateral pros canais-mundo
- [x] Testes: `tests/world.test.js` (regras + criar canal). `npm test` passa.
- [x] READMEs atualizados

Controles: WASD/setas (shift corre), clique no chão anda até lá, clique num assento anda e senta
(se travar num móvel no caminho, "pula" pro assento — não tem desvio de caminho/pathfinding),
X levanta (andar também levanta), 1 acena, 2 dança, arrastar gira a câmera, roda = zoom,
clique num boneco abre o perfil, botão direito = volume da pessoa.

Limitações conhecidas / ideias de polimento:
- Sem pathfinding: clique no chão atrás de um móvel para no móvel.
- Bonecos procedurais simples (sem rig). Etiqueta mostra 🔇/🎧 quando mudo/surdo.
- Câmera/vídeo da pessoa não aparecem no mundo (só na grade de call normal). Uma ideia: mostrar
  a câmera numa "tela" flutuante em cima do boneco.
- Soundboard, som da tela e bot de música não são espaciais.

### Etapa 2 — apartamento de luxo, 1ª/3ª pessoa, TV e visual fofo ✅ (feita, testada no navegador)
Pedido do dono: interface "redondinha e bonitinha, que não pareça feita por IA"; bonecos mais
bonitos; o ambiente vira um **apartamento de luxo com 2 andares**; câmera em **1ª e 3ª pessoa**;
uma **TV** onde alguém compartilha a tela OU coloca um **vídeo do YouTube pra todo mundo ver** — e
quem assiste pode pôr a TV em **tela cheia** ou **mutar a TV só pra si**.

- [x] Cena `public/world/scenes/penthouse.json` (gerada por um script Python simples — os números
      saíram de um layout no papel; dá pra editar o JSON direto). Virou a padrão; cenas
      desconhecidas (como a antiga `lounge`) caem nela. Térreo: sala com pé-direito duplo, sofá em
      L de frente pra TV gigante num painel de ripas, poltrona, mesa de mármore, piano de cauda,
      paredes de vidro (sul e leste) com a cidade à noite; embaixo do mezanino: cozinha com ilha e
      4 banquetas, mesa de jantar com 6 cadeiras (futura mesa de jogos). Mezanino (y = 3.6): pufes
      olhando pra sala, sofá azul, estante, mesa redonda com 4 cadeiras (futuro xadrez). Escada reta.
- [x] Alturas: `surfaces` (retângulos com `y` fixo ou `ramp`). `groundAt()` em world.js pega, das
      superfícies a até 0.6 m da altura atual, a MAIS ALTA (por isso o boneco sobe a escada em vez
      de passar embaixo). Colisores têm `minY`/`maxY`. Um colisor baixo (maxY 0.1) impede andar
      embaixo da escada.
- [x] Clique pra andar em outro andar: `planRoute()` passa pelo pé e pelo topo da escada.
      O "travou" é medido em tempo de jogo (dt), não em relógio (fps baixo não quebra a rota).
- [x] Servidor aceita/clampa `y` (0..bounds.maxY); assentos têm `floor` e `y` (altura do assento).
- [x] Corte do mezanino na 3ª pessoa (`upperGroup` some quando você está embaixo dele) e paredes de
      vidro somem quando a câmera está do lado de fora (`room.glassSides`).
- [x] Bonecos toon (MeshToonMaterial + contorno por casca invertida, orelhinhas de ursinho, olhos
      com brilho que piscam, boquinha que abre quando fala, bochechas).
- [x] Câmera 1ª pessoa (V ou botão no dock): esconde o próprio corpo, arrastar olha em volta;
      o corpo vira pra onde você olha (os outros veem). Preferência salva no aparelho.
- [x] TV (`public/world/tv.js`): estado no servidor por call (`world_tv` → `world_tv_state`;
      `world_tv_denied` pra erro). `off` | `screen` (userId) | `youtube` (videoId, playing,
      position, refAt). Começar a compartilhar numa call-mundo põe na TV sozinho (se desligada);
      parar/sair desliga. Vídeo/iframe = CSS3D atrás do canvas com "furo" (NoBlending, alfa 0).
      O YouTube corrige quem passar de 1,5 s de diferença; a API do iframe só carrega quando alguém
      põe um vídeo (com timeout de 15 s).
- [x] Por pessoa: mutar a TV só pra mim, volume, tela cheia (botão, ou duplo clique na TV).
      YouTube abaixa com a distância. Som da tela compartilhada: continua tocando pelo tile
      escondido da call (`.call-screenshare-area` some no modo mundo), multiplicado por
      `worldScreenAudioFactor()` (27-world.js).
- [x] HUD novo (world.css): dock redondinho com emojis (acenar, dançar, levantar, câmera, TV),
      dica que dá pra fechar, etiquetas em balão com rabinho, painel da TV em "folha".
- [x] Testes do servidor (tests/world.test.js: altura, assento no mezanino, TV).

Atalhos: WASD/setas, shift corre, 1 acena, 2 dança, X levanta, V troca a câmera, T abre a TV,
F tela cheia (o mundo inteiro, com os botões da call — botão "tela cheia" no dock também).

Correção pós-etapa 2: canais criados na etapa 1 tinham `world_scene = 'lounge'` (arquivo apagado)
e o mundo não carregava ("não deu pra carregar o mundinho"). Agora: o boot do banco troca cenas
inexistentes pela padrão, o servidor manda a cena efetiva em `voice_channel_state.self.scene`, e o
site cai na `penthouse` se o JSON da cena não existir. A tela de erro mostra o motivo e tem
"tentar de novo".

Ideias de polimento que ficaram de fora:
- Som do YouTube não é espacial (é iframe de outro domínio, não dá pra passar pelo Web Audio) — só
  abaixa com a distância. Som da tela também não é espacial.
- Pathfinding de verdade (hoje: linha reta + escada).
- Colocar a câmera da pessoa numa "telinha" em cima do boneco.

### Etapa 3 — mira na 1ª pessoa, escuta mais curta, Duno (estilo Uno) e piano ✅ (feita, testada)
- [x] 1ª pessoa: clicar no mundo prende o mouse (pointer lock) e a câmera segue o mouse; Esc solta.
      Com o mouse preso, clicar usa o que está na MIRA (sentar, TV, perfil, andar até o ponto).
      Mira liga/desliga no dock (🎯) ou tecla C (salvo no aparelho). Abrir um painel solta o mouse.
- [x] Escuta: PannerNode `linear`, ref 1.2 m, some em 9 m (`createWorldPanner`, 27-world.js).
- [x] Mesa de jogos redonda com 8 cadeiras no mezanino (`tables` na cena, cadeiras `jogo-1..8`).
- [x] Duno no servidor (`server/games/duno.js`, testes em `tests/duno.test.js`):
      host = primeiro a sentar (passa pro próximo se levantar antes de começar); cada um escolhe
      jogar/assistir; host começa (2 a 8). 108 cartas; combinar cor/número/símbolo; coringa escolhe
      cor; pula, inverte (com 2 = pula), +2, +4 (o próximo compra e perde a vez, sem acumular).
      Comprar: se a comprada serve, dá pra jogar ela ou passar; se não serve, passa sozinho.
      "DUNO!": quem fica com 1 carta sem gritar pode ser pego pelos outros até a próxima jogada (+2).
      Tempo: 30 s por jogada (12 s depois de comprar); estourou = compra 1 e passa.
      Sair da partida devolve as cartas pro monte; ficou 1 = ele ganha. Sair da call = sai do jogo.
      Quem joga e levanta continua jogando (o painel vai junto). Visão filtrada: jogador só recebe a
      própria mão; quem não joga (sentado assistindo OU qualquer um andando pela casa) vê todas.
- [x] Realtime: `game` → `game_state` (por pessoa) / `game_denied`; snapshot em `voice_channel_state.self.games`.
- [x] Site (`public/world/games/duno.js`, carregado sob demanda): saguão, cronômetro, mão com as
      jogáveis levantadas, seletor de cor, DUNO!/pegar, sair; monte + descarte + pilhas na mesa 3D.
      Abre sozinho ao sentar na mesa, quando a partida começa e na sua vez. Dock 🃏 / tecla G.
- [x] Piano (`public/world/piano.js`): sentar no banco (`piano-banco`) abre o teclado; atalhos
      A S D F G H J K L Ç ' (brancas) e W E T Y U O P (pretas), Z/X oitava, Esc levanta; o rótulo de
      cada tecla vem do layout do teclado da pessoa (`navigator.keyboard.getLayoutMap`). Som
      sintetizado (osciladores + filtro), espacial (sai do piano), e vai pros outros por
      `piano` → `piano_note` (só quem está no banco toca, até 60 notas/s).

Ideias que ficaram de fora: acumular +2/+4, desafiar o +4, placar entre partidas, mais jogos
(xadrez na mesa de jantar), sustain no piano (pedal), mostrar quem está tocando o piano pra quem vê.

### Etapa 3.1 — cartas na mão em 3D + pointer lock no app ✅
- Modo cartas (`syncCardMode` em world.js + `setCardMode/pointerMove/click/updateCards` em
  games/duno.js): jogando e SENTADO na mesa, a câmera fica em 1ª pessoa (um pouco acima e atrás do
  assento, olhando a mesa) e a mão aparece em 3D, presa na câmera, em leque. Passar o mouse levanta
  a carta; clicar joga (coringa abre o seletor de cor flutuante); clicar no monte compra. Botão
  direito arrastando = olhar em volta. Os outros jogadores têm um leque de cartas viradas na frente
  da cadeira. A interface vira só uma barrinha em cima (de quem é a vez, cor, anel de tempo,
  passar/DUNO!/pegar, ☰ painel completo, sair). Dock e dica somem nesse modo. Levantou = volta ao
  normal (o painel completo continua servindo pra jogar andando).
- App desktop: o Electron negava o pointer lock (faltava `pointerLock` na lista de permissões em
  electron/main.js) → corrigido na versão 0.5.4 do app. Pra apps antigos: se o pointer lock falhar
  (`pointerlockerror`), a 1ª pessoa entra no modo "mouse solto": a câmera segue o movimento do
  mouse sem prender e o clique vale onde o cursor está (a mira some).

### Etapa 4 — 21 (blackjack) em 2 mesas no térreo ✅
- [x] Cena: duas mesas de 21 (`mesa-21-1` em x 0.9 e `mesa-21-2` em x 5.2, z 4.3), entre a sala de TV
      e a parede de vidro, com 5 cadeiras cada (`bj1-1..5`, `bj2-1..5`; a 1ª é à esquerda da banca,
      que é por onde a vez começa), tapete vinho, luminária e colisor. O nascer foi pra (3.05, 1.6).
      Cada mesa da cena tem `game` (`'duno'` ou `'blackjack'`).
- [x] `server/games/blackjack.js` (testes em `tests/blackjack.test.js`), mesmo formato do Duno
      (`handle/onSeat/onLeaveCall/clearChannel/viewFor`). `server/realtime.js` tem um despachante
      (`gameTables`) que manda cada mesa pro jogo dela.
      Regras: sapato de 6 baralhos (novo quando sobra < 1/4); aposta 10–500; cada um começa com
      1000 fichas (em memória, valem em qualquer mesa; acabou = "pegar mais 1000"); blackjack paga
      3:2; a banca confere blackjack quando mostra Ás/10 (acaba a rodada na hora) e para em 17 mole;
      dobrar só com 2 cartas; dividir par de mesmo valor até 4 mãos (Ás dividido = 1 carta só; 21
      depois de dividir não é blackjack); sem seguro/desistência.
      Fluxo: apostas (todo mundo sentado apostou = dá as cartas; senão 12 s depois da 1ª aposta, ou
      "dar as cartas agora") → vez de cada mão na ordem das cadeiras (20 s; estourou o tempo = para)
      → banca vira e compra uma carta a cada 0,8 s → resultado (6 s) → apostas de novo. Levantou ou
      saiu da call: aposta não jogada volta; mão em jogo para.
      Visão: tudo é aberto, menos a carta escondida da banca e o sapato.
- [x] Site: `public/world/props.js` (`blackjackTable`: meia-lua com feltro impresso em arco, borda
      acolchoada, bandeja de fichas, sapato e porta-descarte) e `public/world/games/blackjack.js`
      (carregado sob demanda; um módulo pra todas as mesas de 21): cartas e fichas em 3D na frente de
      cada cadeira e da banca; painel (cronômetro, banca, mãos, fichas 10/25/100/500 pra montar a
      aposta, pedir/parar/dobrar/dividir). Abre ao sentar e na sua vez; dock ♠️ 21 / tecla B; quem
      não está sentado pode olhar as duas mesas pelo painel.

### Etapa 5 — xadrez em 2 mesas no mezanino ✅
- [x] Cena: duas mesas de xadrez (`xadrez-1` em x -9.2 e `xadrez-2` em x -5.8, z 0.2, no mezanino),
      entre a sala dos pufes e a mesa do Duno, com 2 cadeiras frente a frente (`xadrez1-a` a oeste,
      `xadrez1-b` a leste; idem `xadrez2-*`), tapete, luminária e colisor. `game: 'chess'`.
- [x] `server/games/chess.js` (testes em `tests/chess.test.js`, com perft da posição inicial e de 3
      posições clássicas — roque, en passant, promoção e cravadas), mesmo formato dos outros jogos.
      Regras completas; empate automático por material insuficiente, 3 repetições e 50 lances.
      Modos: clássico 30+20, rápido 10+5 (padrão) e blitz 3+2 (minutos + segundos por lance).
      Fluxo: senta → qualquer um dos dois escolhe o modo → os dois "pronto" → começa (cadeira `-a` de
      brancas na 1ª; revanche com as mesmas pessoas troca as cores). Desistir, oferecer/aceitar/recusar
      empate, cancelar antes do 1º lance de cada um. Tempo zerado perde (empata se o outro não tem
      como dar mate). Levantou/saiu da call no meio: 60 s pra voltar, senão perde por abandono.
      Visão: tudo aberto (quem assiste vê tudo); só quem tem a vez recebe a lista de lances legais.
- [x] Site: `public/world/props.js` (`chessTable`: tampo de nogueira com o tabuleiro embutido, casas
      de 0.065 m) e `public/world/games/chess.js` — carregado junto com o mundo (é leve): as peças
      (torneadas em código, estilo Staunton) ficam sempre na mesa e deslizam a cada lance (cavalo
      pula, roque leva a torre junto, capturada some), com destaque do último lance e do rei em
      xeque, e um relógio de xadrez em cima da mesa — quem está de fora vê a partida sem abrir nada.
      Painel (abre ao sentar e quando a partida começa; dock ♟️ / tecla K): tabuleiro 2D (clica na
      peça, depois na casa; escolhe a peça na promoção), relógios, lances em notação brasileira
      (R D T B C) e os botões. Quem assiste abre o painel da mesa mais perto ("ver outra mesa" troca).

### Próximas etapas (ideias combinadas com o dono do projeto)
1. **Emotes/animação melhores**: personagens com rig (glTF CC0, ex.: Quaternius/Kenney),
   carregados sob demanda; escolher boneco/roupa no perfil.
2. **Atividades/jogos**: sistema de módulos — `server/games/<jogo>.js` (estado autoritativo no
   servidor; cartas escondidas só vão pro dono) + `public/world/games/<jogo>.js` (mesa em 3D +
   interface 2D por cima pra quem joga). Sentar na cadeira da mesa = entrar na partida; quem chega
   perto assiste. Ordem: xadrez (chess.js) → cartas estilo Uno (nome/visual próprios) → truco,
   dama, jogo da velha, sinuca…
3. **TV**: a tela compartilhada vira textura de vídeo numa TV do cenário, com o som saindo dela.
4. Mais cenas (terraço, bar), escolhidas nas configurações do canal; soundboard saindo da posição
   de quem tocou.
