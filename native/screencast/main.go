// dusky-screencast — transmite a tela codificada UMA vez (na placa de vídeo) pra várias pessoas.
//
// Por que existe: na call do dusky cada pessoa tem uma conexão direta com cada outra (malha).
// Compartilhando a tela pelo Chromium, o vídeo era codificado NO PROCESSADOR, uma vez POR PESSOA
// assistindo — medido: ~1 núcleo inteiro por pessoa em 1080p60, o que derrubava o fps dos jogos.
// O Chromium não sabe usar o codificador da NVIDIA (NVENC) no Linux.
//
// Aqui: o ffmpeg captura a tela e codifica em H.264 uma única vez (NVENC/VAAPI/QSV/AMF, ou x264 se
// não tiver placa), e este programa entrega o MESMO vídeo já codificado pra cada pessoa, cada uma
// numa RTCPeerConnection própria (Pion). Empacotar um quadro pronto em RTP custa quase nada.
// Medido: captura + NVENC da tela real em 1080p60 = ~9% de um núcleo, não importa quantos assistem.
//
// Protocolo (o app desktop conversa com este programa por stdin/stdout, uma linha JSON por mensagem):
//
//	entrada (comandos):
//	  {"cmd":"start","ffmpeg":"/usr/bin/ffmpeg","args":[...],"iceServers":[...]}
//	      args = argumentos do ffmpeg que escrevem H.264 Annex-B no stdout
//	  Wayland (portal do sistema + GStreamer):
//	  {"cmd":"portal","sourceTypes":3,"cursor":true}       abre o seletor do sistema
//	  {"cmd":"start","bin":"gst-launch-1.0","portal":true,"args":[...],"iceServers":[...]}
//	      o fd do PipeWire vira o fd 3 do processo, e "{node}" nos args vira o número do node
//	  {"cmd":"add","viewer":"12","iceServers":[...]}       nova pessoa assistindo (gera uma oferta;
//	                                                       iceServers opcional = credenciais novas)
//	  {"cmd":"answer","viewer":"12","sdp":{"type":"answer","sdp":"..."}}
//	  {"cmd":"candidate","viewer":"12","candidate":{...}}
//	  {"cmd":"remove","viewer":"12"}                       parou de assistir / saiu da call
//	  {"cmd":"publish","url":"wss://site/livekit","token":"..."}   manda a tela pelo servidor de mídia
//	  {"cmd":"unpublish"}                                  (ver sfu.go — aí não precisa de "add")
//	  {"cmd":"stop"}
//
//	saída (eventos):
//	  {"ev":"ready"}                                       programa pronto pra receber "start"
//	  {"ev":"source","width":2560,"height":1440,"sourceType":1}   (Wayland) escolheu no seletor
//	  {"ev":"cancelled"}                                   (Wayland) fechou o seletor sem escolher
//	  {"ev":"started"}                                     primeiro quadro saiu do ffmpeg
//	  {"ev":"offer","viewer":"12","sdp":{...}}
//	  {"ev":"candidate","viewer":"12","candidate":{...}}
//	  {"ev":"state","viewer":"12","state":"connected"}
//	  {"ev":"stats","fps":59.8,"kbps":7800,"viewers":2}
//	  {"ev":"restarting","reason":"...","attempt":1}       a captura caiu e está subindo de novo
//	                                                       (só com "restart": true no "start")
//	  {"ev":"error","message":"..."}
//	  {"ev":"ended","reason":"..."}                        ffmpeg parou (ou "stop") — o programa sai
//
// Logs vão pro stderr. Se o stdin fechar (o app morreu), o programa encerra sozinho.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/pion/interceptor"
	"github.com/pion/interceptor/pkg/nack"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
	"github.com/pion/webrtc/v4/pkg/media/h264reader"
)

type message struct {
	Cmd        string                     `json:"cmd"`
	Ffmpeg     string                     `json:"ffmpeg,omitempty"`
	Bin        string                     `json:"bin,omitempty"`
	Portal     bool                       `json:"portal,omitempty"`
	SourceType uint32                     `json:"sourceTypes,omitempty"`
	Cursor     bool                       `json:"cursor,omitempty"`
	Args       []string                   `json:"args,omitempty"`
	IceServers []iceServerJSON            `json:"iceServers,omitempty"`
	Viewer     string                     `json:"viewer,omitempty"`
	SDP        *webrtc.SessionDescription `json:"sdp,omitempty"`
	Candidate  *webrtc.ICECandidateInit   `json:"candidate,omitempty"`
	URL        string                     `json:"url,omitempty"`     // publish: endereço do servidor de mídia
	Token      string                     `json:"token,omitempty"`   // publish: ingresso da sala
	Width      int                        `json:"width,omitempty"`   // publish: tamanho do vídeo
	Height     int                        `json:"height,omitempty"`  // (só informativo pro servidor)
	Restart    bool                       `json:"restart,omitempty"` // start: se a captura cair, sobe de novo (ver superviseCapture)
}

// servidor STUN/TURN como o site manda. A Metered manda "urls" como TEXTO ("turn:..."), e o tipo do
// Pion só aceita LISTA — antes, o comando "start" inteiro era recusado ("invalid ICEServer"), o ffmpeg
// nem ligava e quem assistia via preto. Aqui aceita os dois.
type iceServerJSON struct {
	URLs       json.RawMessage `json:"urls"`
	Username   string          `json:"username,omitempty"`
	Credential string          `json:"credential,omitempty"`
}

func toICEServers(list []iceServerJSON) []webrtc.ICEServer {
	out := make([]webrtc.ICEServer, 0, len(list))
	for _, s := range list {
		var urls []string
		if err := json.Unmarshal(s.URLs, &urls); err != nil {
			var one string
			if err := json.Unmarshal(s.URLs, &one); err != nil || one == "" {
				continue
			}
			urls = []string{one}
		}
		out = append(out, webrtc.ICEServer{URLs: urls, Username: s.Username, Credential: s.Credential})
	}
	return out
}

var (
	outMu sync.Mutex
	out   = bufio.NewWriter(os.Stdout)
)

func emit(ev map[string]any) {
	outMu.Lock()
	defer outMu.Unlock()
	b, _ := json.Marshal(ev)
	out.Write(b)
	out.WriteByte('\n')
	out.Flush()
}

func logf(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "[screencast] "+format+"\n", a...)
}

// ---------------------------------------------------------------- pessoas assistindo

type viewer struct {
	id string
	pc *webrtc.PeerConnection
}

// usado só em testes (simular perda de pacotes); nil no app
var extraInterceptors func(*interceptor.Registry)

type caster struct {
	mu         sync.Mutex
	viewers    map[string]*viewer
	track      *webrtc.TrackLocalStaticSample
	api        *webrtc.API
	iceServers []webrtc.ICEServer
	ffmpeg     *exec.Cmd // a captura no ar (troca a cada reinício) — sempre lido/escrito com mu
	stopping   bool      // stop() começou: nenhuma captura nova pode subir (protegido por mu)
	portal     *portalSession
	portalBusy bool
	stopOnce   sync.Once
	done       chan struct{}
	room       *lksdk.Room // sala do servidor de mídia em que a tela está publicada (ver sfu.go)
	publishSeq int         // muda a cada "publish"/"unpublish": tentativa antiga não vale mais
}

func newCaster() (*caster, error) {
	// H.264 constrained baseline, packetization-mode=1: o que todo Chromium decodifica
	track, err := webrtc.NewTrackLocalStaticSample(webrtc.RTPCodecCapability{
		MimeType:    webrtc.MimeTypeH264,
		ClockRate:   90000,
		SDPFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
	}, "video", "dusky-screen")
	if err != nil {
		return nil, err
	}
	m := &webrtc.MediaEngine{}
	if err := m.RegisterDefaultCodecs(); err != nil {
		return nil, err
	}
	// Sem isto, quem assistia pela internet via TELA PRETA (chegava bitrate, mas 0 quadros decodificados):
	// o Pion não reenviava os pacotes perdidos (NACK) nem mandava os relatórios RTCP. Na internet sempre
	// se perde algum pacote; um quadro-chave 1080p tem centenas deles, então ele quase nunca chegava
	// inteiro, o decodificador do outro lado ficava esperando o próximo, que também chegava faltando
	// pedaço... e a tela nunca saía do preto. Agora o pacote perdido é reenviado.
	ir := &interceptor.Registry{}
	if extraInterceptors != nil {
		extraInterceptors(ir)
	}
	// guarda os últimos 8192 pacotes pra reenvio (~5s a 16 Mbps) — o padrão (1024) cobre menos de 1s
	if err := webrtc.ConfigureNackWithOptions(m, ir, nil, nack.ResponderSize(8192)); err != nil {
		return nil, err
	}
	if err := webrtc.ConfigureRTCPReports(ir); err != nil {
		return nil, err
	}
	api := webrtc.NewAPI(webrtc.WithMediaEngine(m), webrtc.WithInterceptorRegistry(ir))
	return &caster{viewers: map[string]*viewer{}, track: track, api: api, done: make(chan struct{})}, nil
}

func (c *caster) addViewer(id string) error {
	c.removeViewer(id) // reconexão: começa do zero
	pc, err := c.api.NewPeerConnection(webrtc.Configuration{ICEServers: c.iceServers})
	if err != nil {
		return err
	}
	sender, err := pc.AddTrack(c.track)
	if err != nil {
		pc.Close()
		return err
	}
	// o RTCP (relatórios, pedidos de quadro-chave) precisa ser lido, senão a fila enche.
	// Quadro-chave chega sozinho a cada 1s (GOP do codificador), então pedido de PLI só é registrado.
	go func() {
		buf := make([]byte, 1500)
		for {
			n, _, err := sender.Read(buf)
			if err != nil {
				return
			}
			_ = n // pedidos de quadro-chave (PLI) chegam aqui; o próximo chega sozinho em até 1s (GOP do codificador)
		}
	}()
	pc.OnICECandidate(func(cand *webrtc.ICECandidate) {
		if cand == nil {
			return
		}
		emit(map[string]any{"ev": "candidate", "viewer": id, "candidate": cand.ToJSON()})
	})
	pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		emit(map[string]any{"ev": "state", "viewer": id, "state": s.String()})
	})
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		pc.Close()
		return err
	}
	if err := pc.SetLocalDescription(offer); err != nil {
		pc.Close()
		return err
	}
	c.mu.Lock()
	c.viewers[id] = &viewer{id: id, pc: pc}
	c.mu.Unlock()
	emit(map[string]any{"ev": "offer", "viewer": id, "sdp": pc.LocalDescription()})
	return nil
}

func (c *caster) getViewer(id string) *viewer {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.viewers[id]
}

func (c *caster) removeViewer(id string) {
	c.mu.Lock()
	v := c.viewers[id]
	delete(c.viewers, id)
	c.mu.Unlock()
	if v != nil {
		v.pc.Close()
	}
}

func (c *caster) viewerCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.viewers)
}

func (c *caster) stop(reason string) {
	c.stopOnce.Do(func() {
		c.mu.Lock()
		c.stopping = true // antes de matar: o supervisor não sobe outra captura no lugar
		if c.ffmpeg != nil && c.ffmpeg.Process != nil {
			c.ffmpeg.Process.Kill()
		}
		portal := c.portal
		c.portal = nil
		for id, v := range c.viewers {
			v.pc.Close()
			delete(c.viewers, id)
		}
		c.mu.Unlock()
		portal.close()
		c.unpublish()
		emit(map[string]any{"ev": "ended", "reason": reason})
		close(c.done)
	})
}

// ---------------------------------------------------------------- vídeo do ffmpeg

func isVCL(t h264reader.NalUnitType) bool {
	return t == h264reader.NalUnitTypeCodedSliceNonIdr || t == h264reader.NalUnitTypeCodedSliceIdr
}

// primeiro slice de um quadro novo: first_mb_in_slice == 0, que em ue(v) é o bit '1' logo depois do
// cabeçalho do NAL
func firstSliceOfFrame(nal *h264reader.NAL) bool {
	return len(nal.Data) > 1 && nal.Data[1]&0x80 != 0
}

// Reinício da captura (só com "restart": true — hoje, tela inteira no Windows pelo ddagrab).
//
// Por que: o ddagrab (Desktop Duplication) do ffmpeg NÃO se recupera de nada. Quando um jogo entra
// em tela cheia EXCLUSIVA o Windows troca o modo de vídeo, a duplicação perde o acesso
// (DXGI_ERROR_ACCESS_LOST → "AcquireNextFrame failed: 887a0026") e, se a resolução do jogo for
// outra, ele reclama "Output parameters changed!". Nos dois casos o ffmpeg sai — e antes isso
// encerrava o compartilhamento. Em "tela cheia em janela" o modo não muda, por isso aquele funcionava.
//
// Agora: a faixa de vídeo, as pessoas assistindo e a publicação no servidor de mídia continuam; só o
// ffmpeg sobe de novo (com quadro-chave novo, SPS/PPS na frente — quem assiste se reajusta sozinho,
// até se o tamanho mudar). Se cair de novo logo em seguida várias vezes, desiste.
const (
	captureMaxRestarts = 8                // seguidas, sem a captura ficar de pé
	captureHealthy     = 15 * time.Second // ficou no ar isso tudo: zera a contagem
)

func (c *caster) runFfmpeg(bin string, args []string, usePortal, restart bool) error {
	if usePortal {
		c.mu.Lock()
		p := c.portal
		c.mu.Unlock()
		if p == nil || p.pwFile == nil {
			return errors.New("nenhuma tela escolhida no portal")
		}
		node := fmt.Sprint(p.node)
		out := make([]string, len(args))
		for i, a := range args {
			out[i] = strings.ReplaceAll(a, "{node}", node)
		}
		args = out
	}
	cmd, stdout, err := c.spawnCapture(bin, args, usePortal)
	if err != nil {
		return err
	}
	go c.superviseCapture(bin, args, usePortal, restart, cmd, stdout)
	return nil
}

// sobe o ffmpeg/gst-launch. Não sobe nada se o stop() já começou.
func (c *caster) spawnCapture(bin string, args []string, usePortal bool) (*exec.Cmd, io.Reader, error) {
	cmd := exec.Command(bin, args...)
	cmd.Stderr = os.Stderr
	if usePortal {
		c.mu.Lock()
		if c.portal == nil || c.portal.pwFile == nil {
			c.mu.Unlock()
			return nil, nil, errors.New("nenhuma tela escolhida no portal")
		}
		cmd.ExtraFiles = []*os.File{c.portal.pwFile} // vira o fd 3 do gst-launch (pipewiresrc fd=3)
		c.mu.Unlock()
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, nil, err
	}
	c.mu.Lock()
	if c.stopping {
		c.mu.Unlock()
		cmd.Process.Kill()
		cmd.Wait()
		return nil, nil, errors.New("parado")
	}
	c.ffmpeg = cmd
	c.mu.Unlock()
	logf("%s iniciado (pid %d)", bin, cmd.Process.Pid)
	return cmd, stdout, nil
}

func (c *caster) isStopping() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.stopping
}

// acompanha a captura até ela acabar; com restart, sobe de novo (ver captureMaxRestarts)
func (c *caster) superviseCapture(bin string, args []string, usePortal, restart bool, cmd *exec.Cmd, stdout io.Reader) {
	fails := 0
	for {
		reason := "a captura não reiniciou"
		startedAt := time.Now()
		if cmd != nil {
			err := c.pump(stdout)
			waitErr := cmd.Wait()
			switch {
			case err != nil && !errors.Is(err, io.EOF):
				reason = "erro lendo o vídeo: " + err.Error()
			case waitErr != nil:
				reason = "ffmpeg parou: " + waitErr.Error()
			default:
				reason = "ffmpeg terminou"
			}
		}
		if c.isStopping() {
			return // quem parou foi o app (ou o stop já está em andamento)
		}
		if !restart {
			c.stop(reason)
			return
		}
		if time.Since(startedAt) >= captureHealthy {
			fails = 0
		}
		fails++
		if fails > captureMaxRestarts {
			c.stop(fmt.Sprintf("%s (desisti depois de %d tentativas)", reason, captureMaxRestarts))
			return
		}
		// a troca de modo de vídeo leva um instante: espera um pouco mais a cada tentativa
		delay := time.Duration(fails) * 400 * time.Millisecond
		logf("captura caiu (%s) — subindo de novo em %v (tentativa %d de %d)", reason, delay, fails, captureMaxRestarts)
		emit(map[string]any{"ev": "restarting", "reason": reason, "attempt": fails})
		select {
		case <-c.done:
			return
		case <-time.After(delay):
		}
		var err error
		cmd, stdout, err = c.spawnCapture(bin, args, usePortal)
		if err != nil {
			logf("não consegui subir a captura de novo: %v", err)
			cmd, stdout = nil, nil
		}
	}
}

func (c *caster) capturing() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ffmpeg != nil
}

// lê os NALs do ffmpeg, junta em quadros (access units) e manda cada quadro pra todo mundo
func (c *caster) pump(r io.Reader) error {
	reader, err := h264reader.NewReader(r)
	if err != nil {
		return err
	}
	var frame []byte
	hasVCL := false
	last := time.Time{}
	started := false

	frames, bytes := 0, 0
	statsAt := time.Now()

	flush := func() error {
		if len(frame) == 0 || !hasVCL {
			return nil
		}
		now := time.Now()
		dur := 16 * time.Millisecond
		if !last.IsZero() {
			dur = now.Sub(last)
		}
		last = now
		if err := c.track.WriteSample(media.Sample{Data: frame, Duration: dur}); err != nil && !errors.Is(err, io.ErrClosedPipe) {
			return err
		}
		if !started {
			started = true
			emit(map[string]any{"ev": "started"})
		}
		frames++
		bytes += len(frame)
		if elapsed := time.Since(statsAt); elapsed >= 2*time.Second {
			emit(map[string]any{
				"ev":      "stats",
				"fps":     float64(frames) / elapsed.Seconds(),
				"kbps":    int(float64(bytes) * 8 / elapsed.Seconds() / 1000),
				"viewers": c.viewerCount(),
			})
			frames, bytes, statsAt = 0, 0, time.Now()
		}
		frame = nil
		hasVCL = false
		return nil
	}

	for {
		nal, err := reader.NextNAL()
		if err != nil {
			flush()
			return err
		}
		t := nal.UnitType
		// começo de quadro novo: um delimitador (AUD), parâmetros (SPS/PPS/SEI) depois de um quadro
		// já completo, ou o primeiro slice de um quadro novo
		if hasVCL && (t == h264reader.NalUnitTypeAUD || t == h264reader.NalUnitTypeSPS ||
			t == h264reader.NalUnitTypePPS || t == h264reader.NalUnitTypeSEI ||
			(isVCL(t) && firstSliceOfFrame(nal))) {
			if err := flush(); err != nil {
				return err
			}
		}
		if t == h264reader.NalUnitTypeAUD {
			continue // não precisa ir pela rede
		}
		frame = append(frame, 0, 0, 0, 1)
		frame = append(frame, nal.Data...)
		if isVCL(t) {
			hasVCL = true
		}
	}
}

// ---------------------------------------------------------------- comandos do app

func main() {
	// app Tauri no Linux: assistir a tela dos outros sem decodificar (ver watch.go)
	if len(os.Args) > 1 && os.Args[1] == "watch" {
		runWatch()
		return
	}
	c, err := newCaster()
	if err != nil {
		emit(map[string]any{"ev": "error", "message": err.Error()})
		os.Exit(1)
	}
	emit(map[string]any{"ev": "ready"})

	go func() {
		sc := bufio.NewScanner(os.Stdin)
		sc.Buffer(make([]byte, 1024*1024), 4*1024*1024)
		for sc.Scan() {
			var msg message
			if err := json.Unmarshal(sc.Bytes(), &msg); err != nil {
				emit(map[string]any{"ev": "error", "message": "comando inválido: " + err.Error()})
				continue
			}
			handle(c, msg)
		}
		c.stop("o app fechou a conexão")
	}()

	<-c.done
	time.Sleep(100 * time.Millisecond) // deixa o último evento sair
}

func handle(c *caster, msg message) {
	fail := func(err error) {
		emit(map[string]any{"ev": "error", "viewer": msg.Viewer, "message": err.Error()})
	}
	switch msg.Cmd {
	case "portal":
		if c.portalBusy || c.portal != nil || c.capturing() {
			fail(errors.New("o seletor já foi aberto"))
			return
		}
		c.portalBusy = true
		types := msg.SourceType
		if types == 0 {
			types = 1 | 2
		}
		// em segundo plano: o seletor pode ficar aberto por minutos e o "stop" tem que continuar chegando
		go func() {
			p, err := openPortal(types, msg.Cursor)
			if errors.Is(err, errPortalCancelled) {
				emit(map[string]any{"ev": "cancelled"})
				c.stop("seletor cancelado")
				return
			}
			if err != nil {
				fail(err)
				c.stop("o portal falhou: " + err.Error())
				return
			}
			select {
			case <-c.done: // pararam enquanto o seletor estava aberto
				p.close()
				return
			default:
			}
			c.mu.Lock()
			c.portal = p
			c.mu.Unlock()
			logf("portal: node %d, %dx%d, tipo %d", p.node, p.width, p.height, p.sourceType)
			emit(map[string]any{"ev": "source", "width": p.width, "height": p.height, "sourceType": p.sourceType})
		}()
	case "start":
		if c.capturing() {
			fail(errors.New("já iniciado"))
			return
		}
		c.iceServers = toICEServers(msg.IceServers)
		bin := msg.Bin
		if bin == "" {
			bin = msg.Ffmpeg
		}
		if err := c.runFfmpeg(bin, msg.Args, msg.Portal, msg.Restart); err != nil {
			fail(fmt.Errorf("não consegui iniciar a captura: %w", err))
			c.stop("a captura não iniciou")
		}
	case "add":
		// o site pode mandar credenciais TURN novas (as do começo vencem em ~1h)
		if len(msg.IceServers) > 0 {
			c.iceServers = toICEServers(msg.IceServers)
		}
		if err := c.addViewer(msg.Viewer); err != nil {
			fail(err)
		}
	case "answer":
		if v := c.getViewer(msg.Viewer); v != nil && msg.SDP != nil {
			if err := v.pc.SetRemoteDescription(*msg.SDP); err != nil {
				fail(err)
			}
		}
	case "candidate":
		if v := c.getViewer(msg.Viewer); v != nil && msg.Candidate != nil {
			if err := v.pc.AddICECandidate(*msg.Candidate); err != nil {
				fail(err)
			}
		}
	case "remove":
		c.removeViewer(msg.Viewer)
	case "publish":
		if msg.URL == "" || msg.Token == "" {
			fail(errors.New("publish precisa de url e token"))
			return
		}
		c.publish(msg.URL, msg.Token, msg.Width, msg.Height)
	case "unpublish":
		c.unpublish()
	case "stop":
		c.stop("parado pelo app")
	default:
		fail(fmt.Errorf("comando desconhecido: %s", msg.Cmd))
	}
}
