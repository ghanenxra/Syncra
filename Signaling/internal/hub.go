package internal

import (
	"sync"
)

// PeerInfo represents info about a client in a room.
type PeerInfo struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	IsHost      bool   `json:"isHost"`
}

// Message represents a WebSocket signaling or chat message.
type Message struct {
	Type        string                 `json:"type"`
	RoomID      string                 `json:"roomId,omitempty"`
	DisplayName string                 `json:"displayName,omitempty"`
	To          string                 `json:"to,omitempty"`
	From        string                 `json:"from,omitempty"`
	Sdp         string                 `json:"sdp,omitempty"`
	Candidate   map[string]interface{} `json:"candidate,omitempty"`
	Text        string                 `json:"text,omitempty"`
	HostID      string                 `json:"hostId,omitempty"`
	Resolution  string                 `json:"resolution,omitempty"`
	Peers       []PeerInfo             `json:"peers,omitempty"`
	IsHost      bool                   `json:"isHost,omitempty"`
	Message     string                 `json:"message,omitempty"` // For errors
}

// Hub maintains the state of active rooms and clients.
type Hub struct {
	rooms      map[string]*Room
	mu         sync.RWMutex
	Register   chan *Client
	Unregister chan *Client
}

// NewHub creates a new Hub instance.
func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
	}
}

// Run executes the hub run loop.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.handleRegister(client)
		case client := <-h.Unregister:
			h.handleUnregister(client)
		}
	}
}

// CreateRoom registers a new room code.
func (h *Hub) CreateRoom(roomID string, resolution string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := NewRoom(roomID, resolution)
	h.rooms[roomID] = room
	return room
}

// GetRoom retrieves a room by ID.
func (h *Hub) GetRoom(roomID string) (*Room, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	room, exists := h.rooms[roomID]
	return room, exists
}

// handleRegister processes new clients joining a room.
func (h *Hub) handleRegister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, exists := h.rooms[c.RoomID]
	if !exists {
		c.Send <- Message{
			Type:    "error",
			Message: "Room not found",
		}
		c.Conn.Close()
		return
	}

	// Check for duplicate username in the room
	for _, client := range room.Clients {
		if client.DisplayName == c.DisplayName {
			c.Send <- Message{
				Type:    "error",
				Message: "Username is already taken in this party",
			}
			c.Conn.Close()
			return
		}
	}

	// Add client to room
	room.Clients[c.ID] = c

	// First client to join becomes the host
	if room.HostID == "" {
		room.HostID = c.ID
	}

	// Collect existing peers
	peers := make([]PeerInfo, 0)
	for id, peer := range room.Clients {
		if id != c.ID {
			peers = append(peers, PeerInfo{
				ID:          peer.ID,
				DisplayName: peer.DisplayName,
				IsHost:      peer.ID == room.HostID,
			})
		}
	}

	// Notify the new client they've joined
	c.Send <- Message{
		Type:       "joined",
		RoomID:     c.RoomID,
		From:       c.ID,
		HostID:     room.HostID,
		Resolution: room.Resolution,
		Peers:      peers,
	}

	// Notify everyone else in the room
	h.broadcastToRoomExceptLocked(c.RoomID, c.ID, Message{
		Type:        "peer-joined",
		From:        c.ID,
		DisplayName: c.DisplayName,
		IsHost:      c.ID == room.HostID,
	})
}

// handleUnregister processes clients disconnecting.
func (h *Hub) handleUnregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, exists := h.rooms[c.RoomID]
	if !exists {
		return
	}

	if _, ok := room.Clients[c.ID]; ok {
		delete(room.Clients, c.ID)
		close(c.Send) // Stops the writePump

		// Notify remaining peers
		h.broadcastToRoomExceptLocked(c.RoomID, "", Message{
			Type: "peer-left",
			From: c.ID,
		})

		// If no peers left, delete room
		if len(room.Clients) == 0 {
			delete(h.rooms, c.RoomID)
		} else if room.HostID == c.ID {
			// Promote next client to Host
			var newHostID string
			for id := range room.Clients {
				newHostID = id
				break
			}
			room.HostID = newHostID
			h.broadcastToRoomExceptLocked(c.RoomID, "", Message{
				Type:   "host-changed",
				HostID: newHostID,
			})
		}
	}
}

// BroadcastToRoom sends a message to all clients in a room.
func (h *Hub) BroadcastToRoom(roomID string, msg Message) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastToRoomExceptLocked(roomID, "", msg)
}

// BroadcastToRoomExcept sends a message to all clients in a room except the specified client.
func (h *Hub) BroadcastToRoomExcept(roomID string, exceptID string, msg Message) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.broadcastToRoomExceptLocked(roomID, exceptID, msg)
}

// broadcastToRoomExceptLocked sends a message, assumes mutex is already locked.
func (h *Hub) broadcastToRoomExceptLocked(roomID string, exceptID string, msg Message) {
	room, exists := h.rooms[roomID]
	if !exists {
		return
	}
	for id, client := range room.Clients {
		if id != exceptID {
			select {
			case client.Send <- msg:
			default:
				// Buffer full, unregister client
				delete(room.Clients, id)
				close(client.Send)
				client.Conn.Close()
				if len(room.Clients) == 0 {
					delete(h.rooms, roomID)
				}
			}
		}
	}
}
