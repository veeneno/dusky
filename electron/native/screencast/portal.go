package main

// Captura de tela no Wayland pelo portal do sistema (org.freedesktop.portal.ScreenCast).
//
// No Wayland nenhum programa pode ler a tela sozinho: quem decide é o compositor (Hyprland, GNOME,
// KDE...), pelo portal. O fluxo é:
//
//	CreateSession -> SelectSources (tela/janela, com cursor) -> Start (abre o seletor do sistema)
//	-> OpenPipeWireRemote (devolve um fd do PipeWire)
//
// Com o fd e o número do node, o GStreamer (pipewiresrc) lê os quadros e codifica na placa de vídeo
// (ver electron/screencast.js). A sessão precisa ficar aberta enquanto durar o compartilhamento:
// fechar a conexão D-Bus encerra a captura.

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/godbus/dbus/v5"
)

const (
	portalDest  = "org.freedesktop.portal.Desktop"
	portalPath  = dbus.ObjectPath("/org/freedesktop/portal/desktop")
	screenCastI = "org.freedesktop.portal.ScreenCast"
	requestI    = "org.freedesktop.portal.Request"
	sessionI    = "org.freedesktop.portal.Session"
)

var errPortalCancelled = errors.New("cancelado")

type portalSession struct {
	conn       *dbus.Conn
	session    dbus.ObjectPath
	pwFile     *os.File // fd do PipeWire (vira o fd 3 do gst-launch)
	node       uint32
	width      int
	height     int
	sourceType uint32 // 1 = tela, 2 = janela, 4 = área
}

func (p *portalSession) close() {
	if p == nil {
		return
	}
	if p.pwFile != nil {
		p.pwFile.Close()
	}
	if p.conn != nil {
		if p.session != "" {
			p.conn.Object(portalDest, p.session).Call(sessionI+".Close", 0)
		}
		p.conn.Close()
	}
}

func randomToken() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "didiscord_" + hex.EncodeToString(b)
}

// chama um método do portal que responde por um objeto Request (sinal Response) e espera a resposta
func portalRequest(conn *dbus.Conn, method string, timeout time.Duration, build func(token string) []any) (map[string]dbus.Variant, error) {
	token := randomToken()
	sender := strings.ReplaceAll(strings.TrimPrefix(conn.Names()[0], ":"), ".", "_")
	reqPath := dbus.ObjectPath("/org/freedesktop/portal/desktop/request/" + sender + "/" + token)

	// inscreve ANTES de chamar, senão a resposta pode chegar antes de estarmos ouvindo
	if err := conn.AddMatchSignal(dbus.WithMatchObjectPath(reqPath), dbus.WithMatchInterface(requestI), dbus.WithMatchMember("Response")); err != nil {
		return nil, err
	}
	defer conn.RemoveMatchSignal(dbus.WithMatchObjectPath(reqPath), dbus.WithMatchInterface(requestI), dbus.WithMatchMember("Response"))
	ch := make(chan *dbus.Signal, 8)
	conn.Signal(ch)
	defer conn.RemoveSignal(ch)

	call := conn.Object(portalDest, portalPath).Call(screenCastI+"."+method, 0, build(token)...)
	if call.Err != nil {
		return nil, fmt.Errorf("%s: %w", method, call.Err)
	}

	deadline := time.After(timeout)
	for {
		select {
		case sig := <-ch:
			if sig == nil || sig.Path != reqPath || len(sig.Body) < 2 {
				continue
			}
			code, _ := sig.Body[0].(uint32)
			results, _ := sig.Body[1].(map[string]dbus.Variant)
			switch code {
			case 0:
				return results, nil
			case 1:
				return nil, errPortalCancelled
			default:
				return nil, fmt.Errorf("%s: o portal recusou (código %d)", method, code)
			}
		case <-deadline:
			return nil, fmt.Errorf("%s: o portal não respondeu", method)
		}
	}
}

// abre a sessão, mostra o seletor do sistema e devolve o fd + node do PipeWire
func openPortal(sourceTypes uint32, wantCursor bool) (*portalSession, error) {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return nil, fmt.Errorf("sem D-Bus da sessão: %w", err)
	}
	p := &portalSession{conn: conn}
	fail := func(err error) (*portalSession, error) {
		p.close()
		return nil, err
	}

	sc := conn.Object(portalDest, portalPath)
	if v, err := sc.GetProperty(screenCastI + ".AvailableSourceTypes"); err == nil {
		if avail, ok := v.Value().(uint32); ok && avail != 0 {
			if sourceTypes&avail != 0 {
				sourceTypes &= avail
			} else {
				sourceTypes = avail
			}
		}
	} else {
		return fail(fmt.Errorf("o portal de captura de tela não está disponível: %w", err))
	}
	cursorMode := uint32(1) // escondido
	if wantCursor {
		if v, err := sc.GetProperty(screenCastI + ".AvailableCursorModes"); err == nil {
			if modes, ok := v.Value().(uint32); ok && modes&2 != 0 {
				cursorMode = 2 // desenhado dentro do vídeo
			}
		}
	}

	res, err := portalRequest(conn, "CreateSession", 15*time.Second, func(token string) []any {
		return []any{map[string]dbus.Variant{
			"handle_token":         dbus.MakeVariant(token),
			"session_handle_token": dbus.MakeVariant(randomToken()),
		}}
	})
	if err != nil {
		return fail(err)
	}
	sh, _ := res["session_handle"].Value().(string)
	if sh == "" {
		if op, ok := res["session_handle"].Value().(dbus.ObjectPath); ok {
			sh = string(op)
		}
	}
	if sh == "" {
		return fail(errors.New("CreateSession sem session_handle"))
	}
	p.session = dbus.ObjectPath(sh)

	// o Hyprland (xdph) mostra o seletor já aqui, não no Start — a pessoa pode demorar
	if _, err := portalRequest(conn, "SelectSources", 10*time.Minute, func(token string) []any {
		return []any{p.session, map[string]dbus.Variant{
			"handle_token": dbus.MakeVariant(token),
			"types":        dbus.MakeVariant(sourceTypes),
			"multiple":     dbus.MakeVariant(false),
			"cursor_mode":  dbus.MakeVariant(cursorMode),
		}}
	}); err != nil {
		return fail(err)
	}

	// outros compositores (GNOME, KDE) mostram o seletor aqui
	res, err = portalRequest(conn, "Start", 10*time.Minute, func(token string) []any {
		return []any{p.session, "", map[string]dbus.Variant{"handle_token": dbus.MakeVariant(token)}}
	})
	if err != nil {
		return fail(err)
	}
	if err := p.readStreams(res["streams"]); err != nil {
		return fail(err)
	}

	var fd dbus.UnixFD
	if err := sc.Call(screenCastI+".OpenPipeWireRemote", 0, p.session, map[string]dbus.Variant{}).Store(&fd); err != nil {
		return fail(fmt.Errorf("OpenPipeWireRemote: %w", err))
	}
	p.pwFile = os.NewFile(uintptr(fd), "pipewire-remote")
	return p, nil
}

// streams: a(ua{sv}) — pega o primeiro (pedimos multiple=false)
func (p *portalSession) readStreams(v dbus.Variant) error {
	list, ok := v.Value().([][]any)
	if !ok || len(list) == 0 || len(list[0]) < 2 {
		return errors.New("o portal não devolveu nenhuma tela")
	}
	node, ok := list[0][0].(uint32)
	if !ok {
		return errors.New("o portal devolveu um node inválido")
	}
	p.node = node
	if props, ok := list[0][1].(map[string]dbus.Variant); ok {
		if st, ok := props["source_type"].Value().(uint32); ok {
			p.sourceType = st
		}
		if size, ok := props["size"].Value().([]any); ok && len(size) == 2 {
			w, _ := size[0].(int32)
			h, _ := size[1].(int32)
			p.width, p.height = int(w), int(h)
		}
	}
	return nil
}
