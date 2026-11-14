// Modo "watch": assistir a tela dos outros SEM decodificar (app desktop no Linux).
//
//	dusky-screencast watch
//
// O WebKitGTK (motor do app Tauri no Linux) não tem WebRTC, e o SDK do LiveKit em Rust sempre
// decodifica o vídeo que chega. Aqui o Pion entrega o vídeo ainda comprimido (H.264/VP8/VP9/AV1):
// o programa entra na sala como um participante OCULTO que só assiste ("ver-<id>"), assina só as
// telas compartilhadas e repassa cada quadro inteiro pro app, que manda pra página decodificar com
// o WebCodecs (VideoDecoder) — na placa de vídeo quando dá, e no fps que a pessoa está mandando.
//
// stdin (uma linha JSON por comando):
//
//	{"cmd":"join","url":"wss://site/livekit","token":"...","me":"12"}  entra (me = meu id: não assiste a si mesmo)
//	{"cmd":"keyframe","sid":"TR_xxx"}                               pede um quadro-chave (decodificador perdeu o fio)
//	{"cmd":"watch","user":"7","on":false}                           parar / voltar a assistir a tela de alguém
//
// stdout (binário, uma mensagem atrás da outra): [u8 tipo][u32 LE tamanho][conteúdo]
//
//	tipo 1: JSON  {"ev":"track","sid","identity","codec"} | {"ev":"trackEnded","sid","identity"}
//	              {"ev":"state","state":"connected|reconnecting|disconnected"} | {"ev":"error","message"}
//	tipo 2: quadro [u16 LE tamanho do sid][sid][u8 flags (1 = quadro-chave)][u8 codec][u64 LE µs][dados]
//	        codec: 1 H.264 (Annex B) · 2 VP8 · 3 VP9 · 4 AV1
//
// Se o stdin fechar (o app morreu ou saiu da call), o programa encerra sozinho.
package main

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/pion/rtp"
	"github.com/pion/rtp/codecs"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media/samplebuilder"
)

const (
	codecH264 = 1
	codecVP8  = 2
	codecVP9  = 3
	codecAV1  = 4
)

var (
	wOutMu sync.Mutex
	wOut   = bufio.NewWriterSize(os.Stdout, 1<<20)
)

func wWrite(kind byte, payload []byte) {
	wOutMu.Lock()
	defer wOutMu.Unlock()
	var head [5]byte
	head[0] = kind
	binary.LittleEndian.PutUint32(head[1:], uint32(len(payload)))
	wOut.Write(head[:])
	wOut.Write(payload)
	wOut.Flush()
}

func wEmit(ev map[string]any) {
	b, _ := json.Marshal(ev)
	wWrite(1, b)
}

func wFrame(sid string, key bool, codec byte, tsUs uint64, data []byte) {
	buf := make([]byte, 0, 2+len(sid)+10+len(data))
	buf = binary.LittleEndian.AppendUint16(buf, uint16(len(sid)))
	buf = append(buf, sid...)
	var flags byte
	if key {
		flags = 1
	}
	buf = append(buf, flags, codec)
	buf = binary.LittleEndian.AppendUint64(buf, tsUs)
	buf = append(buf, data...)
	wWrite(2, buf)
}

// ---------------------------------------------------------------- quadro-chave?

func isKeyframe(codec byte, data []byte) bool {
	switch codec {
	case codecH264:
		// procura uma NAL IDR (5) ou SPS (7) depois de algum código de início
		for i := 0; i+3 < len(data); i++ {
			if data[i] == 0 && data[i+1] == 0 && (data[i+2] == 1 || (data[i+2] == 0 && data[i+3] == 1)) {
				j := i + 3
				if data[i+2] == 0 {
					j = i + 4
				}
				if j < len(data) {
					t := data[j] & 0x1f
					if t == 5 || t == 7 {
						return true
					}
				}
			}
		}
		return false
	case codecVP8:
		return len(data) > 0 && data[0]&0x01 == 0
	case codecVP9:
		if len(data) == 0 {
			return false
		}
		// frame marker (2 bits), perfil (2 bits, +1 reservado no perfil 3), show_existing (1), frame_type (1: 0 = chave)
		b := data[0]
		profile := (b>>5)&1 | ((b>>4)&1)<<1
		shift := uint(3)
		if profile == 3 {
			shift = 2
		}
		if (b>>shift)&1 == 1 { // show_existing_frame
			return false
		}
		return (b>>(shift-1))&1 == 0
	case codecAV1:
		// tem um cabeçalho de sequência (OBU tipo 1)?
		for i := 0; i < len(data); {
			h := data[i]
			typ := (h >> 3) & 0x0f
			if typ == 1 {
				return true
			}
			hasSize := h&0x02 != 0
			ext := h&0x04 != 0
			i++
			if ext {
				i++
			}
			if !hasSize {
				return false
			}
			size, n := 0, 0
			for k := 0; k < 8 && i+k < len(data); k++ {
				size |= int(data[i+k]&0x7f) << (7 * k)
				n++
				if data[i+k]&0x80 == 0 {
					break
				}
			}
			i += n + size
		}
		return false
	}
	return false
}

// ---------------------------------------------------------------- sala

type watcher struct {
	mu        sync.Mutex
	room      *lksdk.Room
	me        string
	unwatched map[string]bool // ids de quem eu parei de assistir
	tracks    map[string]*watchedTrack
}

type watchedTrack struct {
	rp   *lksdk.RemoteParticipant
	ssrc webrtc.SSRC
}

// "tela-7" e "7" são a mesma pessoa (o auxiliar de tela dela e ela mesma)
func userOf(identity string) string { return strings.TrimPrefix(identity, "tela-") }

func isScreenVideo(p *lksdk.RemoteTrackPublication) bool {
	return p.Kind() == lksdk.TrackKindVideo && p.Source() == livekit.TrackSource_SCREEN_SHARE
}

func (w *watcher) wants(identity string) bool {
	u := userOf(identity)
	w.mu.Lock()
	defer w.mu.Unlock()
	return u != w.me && !strings.HasPrefix(identity, "ver-") && !w.unwatched[u]
}

func (w *watcher) consider(p *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
	if isScreenVideo(p) && w.wants(rp.Identity()) {
		_ = p.SetSubscribed(true)
	}
}

func codecOf(mime string) (byte, rtp.Depacketizer, uint16) {
	switch strings.ToLower(mime) {
	case "video/h264":
		return codecH264, &codecs.H264Packet{}, 512
	case "video/vp8":
		return codecVP8, &codecs.VP8Packet{}, 512
	case "video/vp9":
		return codecVP9, &codecs.VP9Packet{}, 512
	case "video/av1":
		return codecAV1, &codecs.AV1Depacketizer{}, 512
	}
	return 0, nil, 0
}

func (w *watcher) read(track *webrtc.TrackRemote, pub *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
	sid := pub.SID()
	codec, depack, maxLate := codecOf(track.Codec().MimeType)
	if codec == 0 {
		wEmit(map[string]any{"ev": "error", "message": "codec de vídeo não suportado: " + track.Codec().MimeType})
		return
	}
	w.mu.Lock()
	w.tracks[sid] = &watchedTrack{rp: rp, ssrc: track.SSRC()}
	w.mu.Unlock()
	wEmit(map[string]any{"ev": "track", "sid": sid, "identity": rp.Identity(), "codec": codec})
	// pede um quadro-chave já: sem ele não dá pra começar a decodificar
	rp.WritePLI(track.SSRC())

	sb := samplebuilder.New(maxLate, depack, track.Codec().ClockRate, samplebuilder.WithMaxTimeDelay(300*time.Millisecond))
	clock := float64(track.Codec().ClockRate)
	var first uint32
	started := false
	for {
		pkt, _, err := track.ReadRTP()
		if err != nil {
			break
		}
		sb.Push(pkt)
		for {
			sample := sb.Pop()
			if sample == nil {
				break
			}
			ts := sample.PacketTimestamp
			if !started {
				first, started = ts, true
			}
			us := uint64(float64(ts-first) / clock * 1e6)
			wFrame(sid, isKeyframe(codec, sample.Data), codec, us, sample.Data)
		}
	}
	w.mu.Lock()
	delete(w.tracks, sid)
	w.mu.Unlock()
	wEmit(map[string]any{"ev": "trackEnded", "sid": sid, "identity": rp.Identity()})
}

func (w *watcher) join(url, token, me string) {
	w.mu.Lock()
	w.me = me
	w.mu.Unlock()
	cb := lksdk.NewRoomCallback()
	cb.OnTrackPublished = func(p *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) { w.consider(p, rp) }
	cb.OnTrackSubscribed = func(t *webrtc.TrackRemote, p *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
		go w.read(t, p, rp)
	}
	cb.OnReconnecting = func() { wEmit(map[string]any{"ev": "state", "state": "reconnecting"}) }
	cb.OnReconnected = func() { wEmit(map[string]any{"ev": "state", "state": "connected"}) }
	cb.OnDisconnected = func() { wEmit(map[string]any{"ev": "state", "state": "disconnected"}) }
	room, err := lksdk.ConnectToRoomWithToken(url, token, cb, lksdk.WithAutoSubscribe(false))
	if err != nil {
		wEmit(map[string]any{"ev": "error", "message": "não consegui entrar no servidor de mídia: " + err.Error()})
		return
	}
	w.mu.Lock()
	w.room = room
	w.mu.Unlock()
	wEmit(map[string]any{"ev": "state", "state": "connected"})
	// telas que já estavam no ar quando eu entrei
	for _, rp := range room.GetRemoteParticipants() {
		for _, tp := range rp.TrackPublications() {
			if p, ok := tp.(*lksdk.RemoteTrackPublication); ok {
				w.consider(p, rp)
			}
		}
	}
}

func (w *watcher) setWatching(user string, on bool) {
	w.mu.Lock()
	if on {
		delete(w.unwatched, user)
	} else {
		w.unwatched[user] = true
	}
	room := w.room
	w.mu.Unlock()
	if room == nil {
		return
	}
	for _, rp := range room.GetRemoteParticipants() {
		if userOf(rp.Identity()) != user {
			continue
		}
		for _, tp := range rp.TrackPublications() {
			if p, ok := tp.(*lksdk.RemoteTrackPublication); ok && isScreenVideo(p) {
				_ = p.SetSubscribed(on)
			}
		}
	}
}

func (w *watcher) keyframe(sid string) {
	w.mu.Lock()
	t := w.tracks[sid]
	w.mu.Unlock()
	if t != nil {
		t.rp.WritePLI(t.ssrc)
	}
}

func runWatch() {
	w := &watcher{unwatched: map[string]bool{}, tracks: map[string]*watchedTrack{}}
	sc := bufio.NewScanner(os.Stdin)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		var msg struct {
			Cmd   string `json:"cmd"`
			URL   string `json:"url"`
			Token string `json:"token"`
			Me    string `json:"me"`
			SID   string `json:"sid"`
			User  string `json:"user"`
			On    bool   `json:"on"`
		}
		if json.Unmarshal(sc.Bytes(), &msg) != nil {
			continue
		}
		switch msg.Cmd {
		case "join":
			go w.join(msg.URL, msg.Token, msg.Me)
		case "keyframe":
			w.keyframe(msg.SID)
		case "watch":
			w.setWatching(msg.User, msg.On)
		}
	}
	w.mu.Lock()
	room := w.room
	w.mu.Unlock()
	if room != nil {
		room.Disconnect()
	}
}
