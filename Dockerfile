# Build stage
FROM golang:1.24-alpine AS builder
WORKDIR /app

# Copy go.mod and go.sum from Signaling directory
COPY Signaling/go.mod Signaling/go.sum ./
RUN go mod download

# Copy the rest of the Signaling source code and build
COPY Signaling/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o signaling cmd/main.go

# Production stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/signaling .

EXPOSE 10000
CMD ["./signaling"]
