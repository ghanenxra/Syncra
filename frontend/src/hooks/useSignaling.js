import { useEffect, useRef, useCallback } from 'react';

export function useSignaling(roomId, displayName, onMessage) {
  const ws = useRef(null);
  const onMessageRef = useRef(onMessage);

  // Keep callback reference updated
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!roomId || !displayName) return;

    const url = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:10000';
    
    // Robustly format websocket URL
    let wsUrl = url.trim();
    if (wsUrl.startsWith('https://')) {
      wsUrl = wsUrl.replace('https://', 'wss://');
    } else if (wsUrl.startsWith('http://')) {
      wsUrl = wsUrl.replace('http://', 'ws://');
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      if (wsUrl.includes('localhost') || wsUrl.includes('127.0.0.1')) {
        wsUrl = 'ws://' + wsUrl;
      } else {
        wsUrl = 'wss://' + wsUrl;
      }
    }
    if (!wsUrl.endsWith('/ws')) {
      wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
    }

    console.log('Connecting to Syncra signaling:', wsUrl);
    
    let socket;
    try {
      socket = new WebSocket(wsUrl);
      ws.current = socket;
    } catch (err) {
      console.error('Failed to construct WebSocket. Malformed URL:', wsUrl, err);
      return;
    }

    socket.onopen = () => {
      console.log('Signaling connection established');
      // Send join message immediately
      socket.send(JSON.stringify({
        type: 'join',
        roomId: roomId,
        displayName: displayName
      }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessageRef.current) {
          onMessageRef.current(data);
        }
      } catch (err) {
        console.error('Error processing signaling message:', err);
      }
    };

    socket.onclose = (event) => {
      console.log(`Signaling connection closed: ${event.reason} (${event.code})`);
    };

    socket.onerror = (error) => {
      console.error('Signaling connection error:', error);
    };

    return () => {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try {
          socket.send(JSON.stringify({ type: 'leave' }));
        } catch (e) {
          // ignore
        }
        socket.close();
      }
    };
  }, [roomId, displayName]);

  const sendMessage = useCallback((msg) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify(msg));
      } catch (err) {
        console.error('Failed to send signaling message:', err);
      }
    } else {
      console.warn('Signaling WebSocket not ready. Message dropped:', msg);
    }
  }, []);

  return { sendMessage };
}
