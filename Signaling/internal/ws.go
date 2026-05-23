package internal
 
import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
 
	"github.com/gorilla/websocket"
)
 
const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024 // 512 KB (SDPs can be large)
)
 
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow cross-origin connection
	},
}
 
// Client represents a connected WebSocket peer.
type Client struct {
	Hub             *Hub
	Conn            *websocket.Conn
	Send            chan Message
	ID              string
	RoomID          string
	DisplayName     string
	SessionID       string
	PublishedTracks []TrackInfo
}

// NewClient creates a new Client instance.
func NewClient(hub *Hub, conn *websocket.Conn) *Client {
	return &Client{
		Hub:  hub,
		Conn: conn,
		Send: make(chan Message, 256),
		ID:   generateUniqueID(),
	}
}

// readPump pumps messages from the websocket connection to the hub.
func (c *Client) readPump() {
	defer func() {
		if c.RoomID != "" {
			c.Hub.Unregister <- c
		}
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	c.Conn.SetPingHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		_ = c.Conn.WriteControl(websocket.PongMessage, []byte{}, time.Now().Add(writeWait))
		return nil
	})

	for {
		var msg Message
		err := c.Conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS error for client %s: %v", c.ID, err)
			}
			break
		}

		// First message must be "join"
		if c.RoomID == "" {
			if msg.Type != "join" {
				c.Send <- Message{Type: "error", Message: "First message must be 'join'"}
				return
			}
			if msg.RoomID == "" || msg.DisplayName == "" {
				c.Send <- Message{Type: "error", Message: "roomId and displayName are required"}
				return
			}
			c.RoomID = msg.RoomID
			c.DisplayName = msg.DisplayName

			// Register client to Hub
			c.Hub.Register <- c
			continue
		}

		// Process signaling and chat messages
		switch msg.Type {
		case "offer", "answer", "ice-candidate", "ice-restart-needed":
			if msg.To == "" {
				continue
			}
			room, exists := c.Hub.GetRoom(c.RoomID)
			if !exists {
				continue
			}
			c.Hub.mu.RLock()
			target, ok := room.Clients[msg.To]
			c.Hub.mu.RUnlock()
			if ok {
				// Inject the actual sender ID
				msg.From = c.ID
				select {
				case target.Send <- msg:
				default:
					// Fail silently, hub unregisters full channels
				}
			}

		case "mute-status":
			msg.From = c.ID
			if msg.To != "" {
				room, exists := c.Hub.GetRoom(c.RoomID)
				if exists {
					c.Hub.mu.RLock()
					target, ok := room.Clients[msg.To]
					c.Hub.mu.RUnlock()
					if ok {
						select {
						case target.Send <- msg:
						default:
						}
					}
				}
			} else {
				c.Hub.BroadcastToRoomExcept(c.RoomID, c.ID, msg)
			}

		case "chat":
			msg.From = c.ID
			msg.DisplayName = c.DisplayName
			c.Hub.BroadcastToRoom(c.RoomID, msg)

		case "mute-all":
			room, exists := c.Hub.GetRoom(c.RoomID)
			if !exists {
				continue
			}
			if room.HostID == c.ID {
				// Broadcast mute-mic instruction to other clients
				c.Hub.BroadcastToRoomExcept(c.RoomID, c.ID, Message{
					Type: "mute-mic",
				})
			}

		case "leave":
			return

		case "cf-create-session":
			type SessionReq struct {
				SessionDescription struct {
					Type string `json:"type"`
					Sdp  string `json:"sdp"`
				} `json:"sessionDescription"`
			}
			type SessionResp struct {
				SessionID          string `json:"sessionId"`
				SessionDescription struct {
					Type string `json:"type"`
					Sdp  string `json:"sdp"`
				} `json:"sessionDescription"`
			}

			reqPayload := SessionReq{}
			reqPayload.SessionDescription.Type = "offer"
			reqPayload.SessionDescription.Sdp = msg.Sdp

			var respPayload SessionResp
			err := callCloudflareAPI("/sessions/new", "POST", reqPayload, &respPayload)
			if err != nil {
				log.Printf("Cloudflare /sessions/new failed for client %s: %v", c.ID, err)
				c.Send <- Message{Type: "error", Message: fmt.Sprintf("Cloudflare session creation failed: %v", err)}
				continue
			}

			c.SessionID = respPayload.SessionID
			c.Send <- Message{
				Type:      "cf-session-created",
				SessionID: respPayload.SessionID,
				Sdp:       respPayload.SessionDescription.Sdp,
			}

		case "cf-publish-tracks":
			if c.SessionID == "" {
				c.Send <- Message{Type: "error", Message: "Session not initialized"}
				continue
			}
			type TracksReq struct {
				Tracks []TrackInfo `json:"tracks"`
			}
			type TracksResp struct {
				Tracks []TrackInfo `json:"tracks"`
			}

			reqPayload := TracksReq{Tracks: msg.Tracks}
			var respPayload TracksResp
			path := fmt.Sprintf("/sessions/%s/tracks/new", c.SessionID)
			err := callCloudflareAPI(path, "POST", reqPayload, &respPayload)
			if err != nil {
				log.Printf("Cloudflare /tracks/new (publish) failed for client %s: %v", c.ID, err)
				c.Send <- Message{Type: "error", Message: fmt.Sprintf("Cloudflare publish failed: %v", err)}
				continue
			}

			c.PublishedTracks = respPayload.Tracks
			c.Send <- Message{
				Type:   "cf-tracks-published",
				Tracks: respPayload.Tracks,
			}

			// Broadcast the newly published tracks to other clients in the room
			c.Hub.BroadcastToRoomExcept(c.RoomID, c.ID, Message{
				Type:        "peer-published-tracks",
				From:        c.ID,
				DisplayName: c.DisplayName,
				IsHost:      c.Hub.rooms[c.RoomID].HostID == c.ID,
				Tracks:      respPayload.Tracks,
				SessionID:   c.SessionID,
			})

		case "cf-subscribe-tracks":
			if c.SessionID == "" {
				c.Send <- Message{Type: "error", Message: "Session not initialized"}
				continue
			}
			type SubscribeReq struct {
				Tracks []TrackInfo `json:"tracks"`
			}
			type SubscribeResp struct {
				SessionDescription struct {
					Type string `json:"type"`
					Sdp  string `json:"sdp"`
				} `json:"sessionDescription"`
				RequiresImmediateRenegotiation bool        `json:"requiresImmediateRenegotiation"`
				Tracks                         []TrackInfo `json:"tracks"`
			}

			reqPayload := SubscribeReq{Tracks: msg.Tracks}
			var respPayload SubscribeResp
			path := fmt.Sprintf("/sessions/%s/tracks/new", c.SessionID)
			err := callCloudflareAPI(path, "POST", reqPayload, &respPayload)
			if err != nil {
				log.Printf("Cloudflare /tracks/new (subscribe) failed for client %s: %v", c.ID, err)
				c.Send <- Message{Type: "error", Message: fmt.Sprintf("Cloudflare subscription failed: %v", err)}
				continue
			}

			c.Send <- Message{
				Type:   "cf-tracks-subscribed",
				Sdp:    respPayload.SessionDescription.Sdp,
				Tracks: respPayload.Tracks,
			}

		case "cf-renegotiate":
			if c.SessionID == "" {
				c.Send <- Message{Type: "error", Message: "Session not initialized"}
				continue
			}
			type RenegotiateReq struct {
				SessionDescription struct {
					Type string `json:"type"`
					Sdp  string `json:"sdp"`
				} `json:"sessionDescription"`
			}
			type RenegotiateResp struct {
				SessionDescription struct {
					Type string `json:"type"`
					Sdp  string `json:"sdp"`
				} `json:"sessionDescription"`
			}

			sdpType := msg.SdpType
			if sdpType == "" {
				sdpType = "answer"
			}

			reqPayload := RenegotiateReq{}
			reqPayload.SessionDescription.Type = sdpType
			reqPayload.SessionDescription.Sdp = msg.Sdp

			var respPayload RenegotiateResp
			path := fmt.Sprintf("/sessions/%s/renegotiate", c.SessionID)
			err := callCloudflareAPI(path, "PUT", reqPayload, &respPayload)
			if err != nil {
				log.Printf("Cloudflare /renegotiate failed for client %s: %v", c.ID, err)
				c.Send <- Message{Type: "error", Message: fmt.Sprintf("Cloudflare renegotiation failed: %v", err)}
				continue
			}

			c.Send <- Message{
				Type: "cf-renegotiated",
				Sdp:  respPayload.SessionDescription.Sdp,
			}

		case "cf-close-track":
			if c.SessionID == "" {
				c.Send <- Message{Type: "error", Message: "Session not initialized"}
				continue
			}
			type CloseReq struct {
				Tracks []TrackInfo `json:"tracks"`
			}
			type CloseResp struct{}

			reqPayload := CloseReq{Tracks: msg.Tracks}
			var respPayload CloseResp
			path := fmt.Sprintf("/sessions/%s/tracks/close", c.SessionID)
			err := callCloudflareAPI(path, "PUT", reqPayload, &respPayload)
			if err != nil {
				log.Printf("Cloudflare /tracks/close failed for client %s: %v", c.ID, err)
				continue
			}

			// Remove closed tracks from PublishedTracks
			remaining := make([]TrackInfo, 0)
			for _, published := range c.PublishedTracks {
				closed := false
				for _, toClose := range msg.Tracks {
					if published.TrackID == toClose.TrackID {
						closed = true
						break
					}
				}
				if !closed {
					remaining = append(remaining, published)
				}
			}
			c.PublishedTracks = remaining

			// Broadcast track closure to other peers
			c.Hub.BroadcastToRoomExcept(c.RoomID, c.ID, Message{
				Type:   "peer-closed-tracks",
				From:   c.ID,
				Tracks: msg.Tracks,
			})
		}
	}
}

// writePump pumps messages from the client send channel to the websocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := c.Conn.WriteJSON(msg)
			if err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ServeWs handles WebSocket requests from peers.
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}

	client := NewClient(hub, conn)
	go client.writePump()
	go client.readPump()
}

func generateUniqueID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "client-" + time.Now().Format("20060102150405")
	}
	return hex.EncodeToString(b)
}

func callCloudflareAPI(path string, method string, payload interface{}, target interface{}) error {
	appID := os.Getenv("CLOUDFLARE_APP_ID")
	secret := os.Getenv("CLOUDFLARE_SECRET")
	if appID == "" || secret == "" {
		return fmt.Errorf("Cloudflare Calls credentials not configured")
	}

	url := fmt.Sprintf("https://rtc.live.cloudflare.com/v1/apps/%s%s", appID, path)

	var body io.Reader
	if payload != nil {
		jsonBytes, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewBuffer(jsonBytes)
	}

	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", secret))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Cloudflare API status %d: %s", resp.StatusCode, string(respBody))
	}

	return json.NewDecoder(resp.Body).Decode(target)
}
