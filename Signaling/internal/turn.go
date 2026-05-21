package internal

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// TurnRequest represents the body of the generate-ice-servers request.
type TurnRequest struct {
	TTL int `json:"ttl"`
}

// IceServer represents a single WebRTC ICE server configuration.
type IceServer struct {
	Urls       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

// TurnResponse represents the response containing ICE servers from Cloudflare.
type TurnResponse struct {
	IceServers []IceServer `json:"iceServers"`
}

// GetTurnCredentials fetches dynamic credentials from Cloudflare Realtime API or returns fallback STUN servers.
func GetTurnCredentials() (interface{}, error) {
	appID := os.Getenv("CLOUDFLARE_APP_ID")
	secret := os.Getenv("CLOUDFLARE_SECRET")

	if appID == "" || secret == "" {
		// Local development fallback to public STUN servers
		return TurnResponse{
			IceServers: []IceServer{
				{
					Urls: []string{
						"stun:stun.cloudflare.com:3478",
						"stun:stun.l.google.com:19302",
					},
				},
			},
		}, nil
	}

	url := fmt.Sprintf("https://rtc.live.cloudflare.com/v1/turn/keys/%s/credentials/generate-ice-servers", appID)
	reqBody, _ := json.Marshal(TurnRequest{TTL: 86400})

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create turn request: %w", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", secret))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("turn request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("cloudflare API responded with status: %s", resp.Status)
	}

	var turnResp TurnResponse
	if err := json.NewDecoder(resp.Body).Decode(&turnResp); err != nil {
		return nil, fmt.Errorf("failed to decode turn response: %w", err)
	}

	return turnResp, nil
}
