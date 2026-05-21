package main

import (
	"crypto/rand"
	"encoding/json"
	"log"
	"math/big"
	"net/http"
	"os"

	"github.com/joho/godotenv"
	"signaling/internal"
)

func main() {
	// Load environment variables from .env
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "10000"
	}

	hub := internal.NewHub()
	go hub.Run()

	// HTTP POST /room/create - Creates room code and resolution config
	http.HandleFunc("/room/create", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		type CreateRoomReq struct {
			Resolution string `json:"resolution"`
		}
		var req CreateRoomReq
		_ = json.NewDecoder(r.Body).Decode(&req)

		resolution := req.Resolution
		if resolution != "1080p30" && resolution != "1080p60" {
			resolution = "1080p60" // Default resolution
		}

		roomCode := generateRoomCode()
		hub.CreateRoom(roomCode, resolution)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"roomId":     roomCode,
			"resolution": resolution,
		})
	}))

	// HTTP GET /turn - Fetches temporary TURN configurations
	http.HandleFunc("/turn", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		creds, err := internal.GetTurnCredentials()
		if err != nil {
			log.Printf("Error generating TURN credentials: %v", err)
			http.Error(w, "Failed to generate TURN credentials", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(creds)
	}))

	// WS /ws - Handshake upgrades and messages pumping
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		internal.ServeWs(hub, w, r)
	})

	log.Printf("Signaling server starting on port %s...", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func generateRoomCode() string {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 6)
	for i := range b {
		num, err := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		if err != nil {
			panic(err)
		}
		b[i] = letters[num.Int64()]
	}
	return string(b)
}

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}
