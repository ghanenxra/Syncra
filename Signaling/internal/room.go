package internal

// Room represents a single watch party room.
type Room struct {
	ID         string             `json:"roomId"`
	Clients    map[string]*Client `json:"-"`
	HostID     string             `json:"hostId"`
	Resolution string             `json:"resolution"` // "1080p30" or "1080p60"
}

// NewRoom creates a new Room.
func NewRoom(id string, resolution string) *Room {
	return &Room{
		ID:         id,
		Clients:    make(map[string]*Client),
		HostID:     "",
		Resolution: resolution,
	}
}
