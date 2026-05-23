package internal

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
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
	Hub         *Hub
	Conn        *websocket.Conn
	Send        chan Message
	ID          string
	RoomID      string
	DisplayName string
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
