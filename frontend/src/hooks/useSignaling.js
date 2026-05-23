import { useEffect, useRef, useCallback } from 'react';

export function useSignaling(roomId, displayName, onMessage) {
  const ws = useRef(null);
  const onMessageRef = useRef(onMessage);

  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const isClosingRef = useRef(false);

  // Keep callback reference updated
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!roomId || !displayName) return;

    isClosingRef.current = false;
    reconnectAttemptsRef.current = 0;

    const defaultSignalingUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'ws://localhost:10000'
      : 'wss://syncra-rneu.onrender.com';
    const url = import.meta.env.VITE_SIGNALING_URL || defaultSignalingUrl;
    
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

    const connect = () => {
      if (isClosingRef.current) return;
      console.log('Connecting to Syncra signaling:', wsUrl, `(Attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
      
      let socket;
      try {
        socket = new WebSocket(wsUrl);
        ws.current = socket;
      } catch (err) {
        console.error('Failed to construct WebSocket. Malformed URL:', wsUrl, err);
        return;
      }

      socket.onopen = () => {
        if (isClosingRef.current) {
          socket.close();
          return;
        }
        console.log('Signaling connection established');
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts on success
        
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
        if (isClosingRef.current) {
          console.log('Signaling connection closed gracefully.');
          return;
        }
        console.log(`Signaling connection closed: ${event.reason} (${event.code})`);
        
        if (onMessageRef.current) {
          onMessageRef.current({ type: 'ws-closed', code: event.code, reason: event.reason });
        }

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          reconnectAttemptsRef.current += 1;
          console.log(`Scheduling reconnect in ${delay}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          console.error('Max reconnect attempts reached. Signaling connection failed permanently.');
          if (onMessageRef.current) {
            onMessageRef.current({ type: 'ws-error' });
          }
        }
      };

      socket.onerror = (error) => {
        console.error('Signaling connection error:', error);
      };
    };

    connect();

    return () => {
      isClosingRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        const socket = ws.current;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          try {
            socket.send(JSON.stringify({ type: 'leave' }));
          } catch (e) {
            // ignore
          }
          socket.close();
        }
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
