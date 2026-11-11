// Tela pelo servidor de mídia (LiveKit).
//
// Em vez de abrir uma conexão com cada pessoa assistindo (o "add" de sempre), o programa entra na
// sala da call no LiveKit como um participante à parte ("tela-<id da conta>") e publica lá o MESMO
// vídeo já codificado. Quem distribui pra cada pessoa é o servidor: daqui sai UMA cópia só, não
// importa quantos assistem. O som da tela continua indo pelo site, como sempre.
//
//	entrada:  {"cmd":"publish","url":"wss://site/livekit","token":"...","width":1920,"height":1080}
//	          {"cmd":"unpublish"}
//	saída:    {"ev":"published"}                    o vídeo está na sala
//	          {"ev":"sfu","state":"reconnecting"}    a conexão com o servidor caiu e está voltando
//	          {"ev":"sfu","state":"connected"}       voltou
//	          {"ev":"sfu","state":"disconnected"}    caiu de vez — o site pede "publish" de novo
//	          {"ev":"error","sfu":true,"message":…}  não deu pra publicar — o site volta pro "add"
package main

import (
	"github.com/livekit/protocol/livekit"
	"github.com/livekit/protocol/logger"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

// a biblioteca do LiveKit narra cada passo da conexão no stderr; aqui só interessam os nossos avisos
func init() {
	lksdk.SetLogger(logger.GetDiscardLogger())
}

func (c *caster) publish(url, token string, width, height int) {
	c.unpublish()
	c.mu.Lock()
	c.publishSeq++
	seq := c.publishSeq
	c.mu.Unlock()
	// só vale o aviso da tentativa mais recente (um "publish" novo aposenta os anteriores)
	current := func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()
		return c.publishSeq == seq
	}

	// em segundo plano: conectar pode levar alguns segundos e os outros comandos têm que seguir chegando
	go func() {
		cb := lksdk.NewRoomCallback()
		cb.OnReconnecting = func() {
			if current() {
				emit(map[string]any{"ev": "sfu", "state": "reconnecting"})
			}
		}
		cb.OnReconnected = func() {
			if current() {
				emit(map[string]any{"ev": "sfu", "state": "connected"})
			}
		}
		cb.OnDisconnected = func() {
			if current() {
				emit(map[string]any{"ev": "sfu", "state": "disconnected"})
			}
		}
		// não assina nada: este participante só envia
		room, err := lksdk.ConnectToRoomWithToken(url, token, cb, lksdk.WithAutoSubscribe(false))
		if err != nil {
			if current() {
				emit(map[string]any{"ev": "error", "sfu": true, "message": "não consegui entrar no servidor de mídia: " + err.Error()})
			}
			return
		}
		if !current() { // pararam ou pediram outro "publish" enquanto conectava
			room.Disconnect()
			return
		}
		_, err = room.LocalParticipant.PublishTrack(c.track, &lksdk.TrackPublicationOptions{
			Name:        "tela",
			Source:      livekit.TrackSource_SCREEN_SHARE,
			VideoWidth:  width,
			VideoHeight: height,
		})
		if err != nil {
			room.Disconnect()
			if current() {
				emit(map[string]any{"ev": "error", "sfu": true, "message": "não consegui publicar a tela no servidor de mídia: " + err.Error()})
			}
			return
		}
		c.mu.Lock()
		if c.publishSeq != seq {
			c.mu.Unlock()
			room.Disconnect()
			return
		}
		c.room = room
		c.mu.Unlock()
		logf("tela publicada no servidor de mídia (%dx%d)", width, height)
		emit(map[string]any{"ev": "published"})
	}()
}

func (c *caster) unpublish() {
	c.mu.Lock()
	room := c.room
	c.room = nil
	c.publishSeq++ // qualquer tentativa em andamento deixa de valer
	c.mu.Unlock()
	if room != nil {
		room.Disconnect()
	}
}
