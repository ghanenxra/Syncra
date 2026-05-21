import { useEffect, useRef, useState, useCallback } from 'react';
import { useSignaling } from './useSignaling';

export function useWebRTC(roomId, displayName) {
  const [peers, setPeers] = useState([]); // Array of PeerInfo
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> MediaStream
  const [localMicStream, setLocalMicStream] = useState(null);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [micMuted, setMicMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [myPeerId, setMyPeerId] = useState('');
  const [hostId, setHostId] = useState('');
  const [resolution, setResolution] = useState('1080p60');
  const [chatMessages, setChatMessages] = useState([]);

  const pcs = useRef({}); // peerId -> RTCPeerConnection
  const screenSenders = useRef({}); // peerId -> [RTCRtpSender]
  const iceServersRef = useRef(null);

  // Fetch ICE Servers from signaling server
  const getIceServers = async () => {
    if (iceServersRef.current) return iceServersRef.current;
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const res = await fetch(`${apiUrl}/turn`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.iceServers) {
          iceServersRef.current = data.iceServers;
          return data.iceServers;
        }
      }
    } catch (err) {
      console.error('Error fetching TURN config, falling back to STUN:', err);
    }
    // Fallback STUN configuration
    const fallback = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
    iceServersRef.current = fallback;
    return fallback;
  };

  // Helper to initialize local microphone stream
  const initLocalAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setLocalMicStream(stream);
      return stream;
    } catch (err) {
      console.error('Failed to access microphone:', err);
      // Return empty/mock stream so app doesn't crash if no mic is connected
      const mockCtx = new (window.AudioContext || window.webkitAudioContext)();
      const mockOsc = mockCtx.createOscillator();
      const mockDst = mockCtx.createMediaStreamDestination();
      mockOsc.connect(mockDst);
      return mockDst.stream;
    }
  };

  // Helper to clean up all peer connections
  const cleanUp = useCallback(() => {
    Object.values(pcs.current).forEach(pc => pc.close());
    pcs.current = {};
    screenSenders.current = {};
    if (localMicStream) {
      localMicStream.getTracks().forEach(t => t.stop());
    }
    if (localScreenStream) {
      localScreenStream.getTracks().forEach(t => t.stop());
    }
  }, [localMicStream, localScreenStream]);

  // Create RTCPeerConnection for a remote peer
  const createPeerConnection = async (peerId, remoteName, isInitiator, audioStream, screenStream) => {
    if (pcs.current[peerId]) {
      pcs.current[peerId].close();
    }

    const configIce = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers: configIce });
    pcs.current[peerId] = pc;

    // Attach local mic tracks
    if (audioStream) {
      audioStream.getTracks().forEach(track => {
        pc.addTrack(track, audioStream);
      });
    }

    // Attach local screen tracks if host is sharing
    if (screenStream) {
      const senders = [];
      screenStream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, screenStream);
        senders.push(sender);
      });
      screenSenders.current[peerId] = senders;
    }

    // ICE gathering callback
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          type: 'ice-candidate',
          to: peerId,
          candidate: event.candidate
        });
      }
    };

    // Track arrival callback
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => {
        // If there's an existing stream, append tracks, otherwise add new
        const existing = prev[peerId];
        if (existing) {
          event.streams[0].getTracks().forEach(track => {
            if (!existing.getTracks().find(t => t.id === track.id)) {
              existing.addTrack(track);
            }
          });
          return { ...prev };
        } else {
          return { ...prev, [peerId]: remoteStream };
        }
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state change with ${remoteName}:`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        pc.close();
        delete pcs.current[peerId];
        delete screenSenders.current[peerId];
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendMessage({
          type: 'offer',
          to: peerId,
          sdp: pc.localDescription.sdp
        });
      } catch (err) {
        console.error('Failed to create offer:', err);
      }
    }

    return pc;
  };

  // Handle incoming signaling messages
  const handleSignalingMessage = async (msg) => {
    switch (msg.type) {
      case 'joined':
        setMyPeerId(msg.from);
        setHostId(msg.hostId);
        setResolution(msg.resolution);
        
        // Save own state
        const updatedPeers = [
          { id: msg.from, displayName: displayName, isHost: msg.from === msg.hostId },
          ...msg.peers
        ];
        setPeers(updatedPeers);

        // Get microphone access
        const audio = await initLocalAudio();

        // Connect to existing peers (we initiate to them)
        for (const peer of msg.peers) {
          await createPeerConnection(peer.id, peer.displayName, true, audio, null);
        }
        break;

      case 'peer-joined':
        // Add new peer to state
        setPeers(prev => [...prev, { id: msg.from, displayName: msg.displayName, isHost: msg.isHost }]);
        // Wait for offer from the newly joined peer
        break;

      case 'offer':
        let pcOffer = pcs.current[msg.from];
        if (!pcOffer) {
          // Initialize peer connection (answering client is not initiator)
          pcOffer = await createPeerConnection(msg.from, 'Peer', false, localMicStream, localScreenStream);
        }
        try {
          await pcOffer.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
          const answer = await pcOffer.createAnswer();
          await pcOffer.setLocalDescription(answer);
          sendMessage({
            type: 'answer',
            to: msg.from,
            sdp: pcOffer.localDescription.sdp
          });
        } catch (err) {
          console.error('Failed to handle offer:', err);
        }
        break;

      case 'answer':
        const pcAnswer = pcs.current[msg.from];
        if (pcAnswer) {
          try {
            await pcAnswer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
          } catch (err) {
            console.error('Failed to set remote description on answer:', err);
          }
        }
        break;

      case 'ice-candidate':
        const pcCandidate = pcs.current[msg.from];
        if (pcCandidate) {
          try {
            await pcCandidate.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (err) {
            console.error('Failed to add ICE candidate:', err);
          }
        }
        break;

      case 'chat':
        setChatMessages(prev => [...prev, {
          from: msg.from,
          displayName: msg.displayName,
          text: msg.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        break;

      case 'mute-mic':
        // Host requested to mute everyone
        if (myPeerId !== hostId) {
          muteLocalMicrophone(true);
        }
        break;

      case 'host-changed':
        setHostId(msg.hostId);
        setPeers(prev => prev.map(p => ({
          ...p,
          isHost: p.id === msg.hostId
        })));
        break;

      case 'peer-left':
        const leavingId = msg.from;
        if (pcs.current[leavingId]) {
          pcs.current[leavingId].close();
          delete pcs.current[leavingId];
          delete screenSenders.current[leavingId];
        }
        setPeers(prev => prev.filter(p => p.id !== leavingId));
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[leavingId];
          return next;
        });
        break;

      case 'error':
        alert(msg.message);
        window.location.href = '/';
        break;
    }
  };

  // Hook up useSignaling hook
  const { sendMessage } = useSignaling(roomId, displayName, handleSignalingMessage);

  // Toggle local mic mute state
  const muteLocalMicrophone = (forceMuted = null) => {
    if (localMicStream) {
      const audioTrack = localMicStream.getAudioTracks()[0];
      if (audioTrack) {
        const nextState = forceMuted !== null ? forceMuted : !audioTrack.enabled;
        audioTrack.enabled = !nextState;
        setMicMuted(nextState);
      }
    }
  };

  // Toggle screen share (Host only)
  const toggleScreenSharing = async () => {
    if (screenSharing) {
      // Stop screen share
      if (localScreenStream) {
        localScreenStream.getTracks().forEach(t => t.stop());
      }
      setLocalScreenStream(null);
      setScreenSharing(false);

      // Remove screen tracks from all PCs
      Object.keys(pcs.current).forEach(peerId => {
        const pc = pcs.current[peerId];
        const senders = screenSenders.current[peerId] || [];
        senders.forEach(sender => {
          try {
            pc.removeTrack(sender);
          } catch (e) {
            console.warn(e);
          }
        });
        delete screenSenders.current[peerId];
      });
    } else {
      // Start screen share
      try {
        const fps = resolution === '1080p60' ? 60 : 30;
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: 1920,
            height: 1080,
            frameRate: fps
          },
          audio: false // We share screen only, audio via mic
        });

        setLocalScreenStream(stream);
        setScreenSharing(true);

        // Add screen tracks to all peer connections and renegotiate
        for (const peerId of Object.keys(pcs.current)) {
          const pc = pcs.current[peerId];
          const senders = [];
          stream.getTracks().forEach(track => {
            const sender = pc.addTrack(track, stream);
            senders.push(sender);
          });
          screenSenders.current[peerId] = senders;

          // renegotiate by sending a new offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendMessage({
            type: 'offer',
            to: peerId,
            sdp: pc.localDescription.sdp
          });
        }

        // Setup end handler (when browser stop sharing bar is clicked)
        stream.getVideoTracks()[0].onended = () => {
          // Stop tracks and clean up state
          stream.getTracks().forEach(t => t.stop());
          setLocalScreenStream(null);
          setScreenSharing(false);
          Object.keys(pcs.current).forEach(peerId => {
            const pc = pcs.current[peerId];
            const senders = screenSenders.current[peerId] || [];
            senders.forEach(sender => {
              try {
                pc.removeTrack(sender);
              } catch (e) {
                console.warn(e);
              }
            });
            delete screenSenders.current[peerId];
          });
        };
      } catch (err) {
        console.error('Failed to share screen:', err);
      }
    }
  };

  // Host only: request all guest peers to mute themselves
  const hostMuteEveryone = () => {
    if (myPeerId === hostId) {
      sendMessage({ type: 'mute-all' });
    }
  };

  // Send a chat message
  const sendChatMessage = (text) => {
    if (text.trim() === '') return;
    sendMessage({
      type: 'chat',
      text: text
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanUp();
    };
  }, [cleanUp]);

  return {
    peers,
    remoteStreams,
    localMicStream,
    localScreenStream,
    micMuted,
    screenSharing,
    myPeerId,
    hostId,
    isHost: myPeerId === hostId,
    resolution,
    chatMessages,
    toggleMic: () => muteLocalMicrophone(),
    toggleScreenSharing,
    hostMuteEveryone,
    sendChatMessage
  };
}
