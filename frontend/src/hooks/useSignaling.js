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

    const url = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8080';
    // Ensure we use ws:// or wss:// protocols
    const wsUrl = `${url.replace(/^http/, 'ws')}/ws`;

    console.log('Connecting to Syncra signaling:', wsUrl);
    const socket = new WebSocket(wsUrl);
    ws.current = socket;

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
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.send(JSON.stringify({ type: 'leave' }));
        socket.close();
      }
    };
  }, [roomId, displayName]);

  const sendMessage = useCallback((msg) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    } else {
      console.warn('Signaling WebSocket not ready. Message dropped:', msg);
    }
  }, []);

  return { sendMessage };
}
