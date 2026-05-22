import { useEffect, useRef, useState, useCallback } from 'react';
import { useSignaling } from './useSignaling';

export function useWebRTC(roomId, displayName) {
  const [peers, setPeers] = useState([]); // Array of PeerInfo
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> MediaStream (Audio)
  const [remoteVideoStreams, setRemoteVideoStreams] = useState({}); // peerId -> MediaStream (Video/Screen Share)
  const [localMicStream, setLocalMicStream] = useState(null);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [micMuted, setMicMuted] = useState(false);
  const [roomMuted, setRoomMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [myPeerId, setMyPeerId] = useState('');
  const [hostId, setHostId] = useState('');
  const [resolution, setResolution] = useState('1080p60');
  const [chatMessages, setChatMessages] = useState([]);
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState(null);

  const pcs = useRef({}); // peerId -> RTCPeerConnection
  const screenSenders = useRef({}); // peerId -> RTCRtpSender
  const iceServersRef = useRef(null);

  const localScreenStreamRef = useRef(null);
  const myPeerIdRef = useRef('');
  const hostIdRef = useRef('');

  useEffect(() => {
    localScreenStreamRef.current = localScreenStream;
  }, [localScreenStream]);

  useEffect(() => {
    myPeerIdRef.current = myPeerId;
  }, [myPeerId]);

  useEffect(() => {
    hostIdRef.current = hostId;
  }, [hostId]);

  // Static ICE Servers configuration
  const getIceServers = () => [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ];

  // Helper to initialize local microphone stream
  const initLocalAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (micMuted) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
        }
      }
      setLocalMicStream(stream);
      return stream;
    } catch (err) {
      console.error('Failed to access microphone:', err);
      // Return empty/mock stream so app doesn't crash if no mic is connected
      const mockCtx = new (window.AudioContext || window.webkitAudioContext)();
      const mockOsc = mockCtx.createOscillator();
      const mockDst = mockCtx.createMediaStreamDestination();
      mockOsc.connect(mockDst);
      const stream = mockDst.stream;
      if (micMuted) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
        }
      }
      return stream;
    }
  };

  // Helper to clean up all peer connections
  const cleanUp = useCallback(() => {
    Object.values(pcs.current).forEach(pc => pc.close());
    pcs.current = {};
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

    const configIce = getIceServers();
    const pc = new RTCPeerConnection({ iceServers: configIce });
    pcs.current[peerId] = pc;

    // Attach local screen share track if host has one active
    if (screenStream) {
      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const sender = pc.addTrack(videoTrack, screenStream);
          screenSenders.current[peerId] = sender;
        } catch (e) {
          console.warn('Failed to add screen track during peer connection creation:', e);
        }
      }
    }

    // Attach local mic tracks
    if (audioStream) {
      audioStream.getTracks().forEach(track => {
        pc.addTrack(track, audioStream);
      });
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
      const remoteStream = event.streams[0] || (event.track ? new MediaStream([event.track]) : null);
      if (!remoteStream) return;

      const hasVideo = remoteStream.getVideoTracks().length > 0 || (event.track && event.track.kind === 'video');
      const hasAudio = remoteStream.getAudioTracks().length > 0 || (event.track && event.track.kind === 'audio');

      if (hasVideo) {
        setRemoteVideoStreams(prev => ({ ...prev, [peerId]: remoteStream }));

        const tracks = remoteStream.getVideoTracks();
        if (event.track && event.track.kind === 'video' && !tracks.includes(event.track)) {
          tracks.push(event.track);
        }
        tracks.forEach(track => {
          track.onended = () => {
            console.log(`Video track ended for peer ${peerId}`);
            setRemoteVideoStreams(prev => {
              const next = { ...prev };
              delete next[peerId];
              return next;
            });
          };
          track.onmute = () => {
            console.log(`Video track muted for peer ${peerId}`);
            setRemoteVideoStreams(prev => ({ ...prev }));
          };
          track.onunmute = () => {
            console.log(`Video track unmuted for peer ${peerId}`);
            setRemoteVideoStreams(prev => ({ ...prev }));
          };
        });
      } else if (hasAudio) {
        setRemoteStreams(prev => ({ ...prev, [peerId]: remoteStream }));

        const tracks = remoteStream.getAudioTracks();
        if (event.track && event.track.kind === 'audio' && !tracks.includes(event.track)) {
          tracks.push(event.track);
        }
        tracks.forEach(track => {
          track.onended = () => {
            console.log(`Audio track ended for peer ${peerId}`);
            setRemoteStreams(prev => {
              const next = { ...prev };
              delete next[peerId];
              return next;
            });
          };
          track.onmute = () => {
            console.log(`Audio track muted for peer ${peerId}`);
            setRemoteStreams(prev => ({ ...prev }));
          };
          track.onunmute = () => {
            console.log(`Audio track unmuted for peer ${peerId}`);
            setRemoteStreams(prev => ({ ...prev }));
          };
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state change with ${remoteName}:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        pc.close();
        delete pcs.current[peerId];
        delete screenSenders.current[peerId];
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
        setRemoteVideoStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    };

    pc.onsignalingstatechange = async () => {
      console.log(`[SignalingState] ${remoteName}: ${pc.signalingState}`);
      if (pc.signalingState === 'stable') {
        const hasVideoSection = pc.remoteDescription && pc.remoteDescription.sdp.includes('m=video');
        const currentScreenStream = localScreenStreamRef.current;
        const isActuallyHost = myPeerIdRef.current && hostIdRef.current && myPeerIdRef.current === hostIdRef.current;
        
        if (currentScreenStream && isActuallyHost && !hasVideoSection) {
          console.log(`Renegotiating screen share for peer ${peerId} (adding video section)...`);
          try {
            const videoTrack = currentScreenStream.getVideoTracks()[0];
            if (videoTrack) {
              if (!screenSenders.current[peerId]) {
                const sender = pc.addTrack(videoTrack, currentScreenStream);
                screenSenders.current[peerId] = sender;
              }
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendMessage({
                type: 'offer',
                to: peerId,
                sdp: pc.localDescription.sdp
              });
            }
          } catch (err) {
            console.error('Failed to renegotiate screen share on stable state:', err);
          }
        }
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
        setConnecting(false);
        setConnectionError(null);
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

        // Broadcast our current mute status to the room
        sendMessage({
          type: 'mute-status',
          muted: micMuted
        });
        break;

      case 'peer-joined':
        // Add new peer to state
        setPeers(prev => [...prev, { id: msg.from, displayName: msg.displayName, isHost: msg.isHost }]);
        // Send our current mute status to the new peer directly
        sendMessage({
          type: 'mute-status',
          to: msg.from,
          muted: micMuted
        });
        break;

      case 'mute-status':
        setPeers(prev => prev.map(p => {
          if (p.id === msg.from) {
            return { ...p, muted: msg.muted };
          }
          return p;
        }));
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
        setRemoteVideoStreams(prev => {
          const next = { ...prev };
          delete next[leavingId];
          return next;
        });
        break;

      case 'ws-closed':
        setConnecting(false);
        setConnectionError('Connection to signaling server was closed.');
        break;

      case 'ws-error':
        setConnecting(false);
        setConnectionError('Failed to connect to signaling server. Poor internet connection or server offline.');
        break;

      case 'error':
        setConnecting(false);
        if (msg.message === 'Room not found') {
          setConnectionError('The party code is invalid. Please check the code and try again.');
        } else {
          setConnectionError(msg.message || 'An error occurred while connecting to the party.');
        }
        break;
    }
  };

  // Hook up useSignaling hook
  const { sendMessage } = useSignaling(roomId, displayName, handleSignalingMessage);

  // Timeout for joining the room
  useEffect(() => {
    if (!connecting) return;
    
    const timer = setTimeout(() => {
      if (connecting) {
        setConnecting(false);
        setConnectionError('Connection timed out. Poor internet connection or signaling server unreachable.');
      }
    }, 8000); // 8 seconds timeout

    return () => clearTimeout(timer);
  }, [connecting]);

  // Toggle local mic mute state
  const muteLocalMicrophone = useCallback((forceMuted = null) => {
    setMicMuted(prev => {
      const nextState = forceMuted !== null ? forceMuted : !prev;
      if (localMicStream) {
        const audioTrack = localMicStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !nextState;
        }
      }
      sendMessage({
        type: 'mute-status',
        muted: nextState
      });
      return nextState;
    });
  }, [localMicStream, sendMessage]);

  // Helper to stop screen share and renegotiate
  const handleStopScreenShare = async (streamToStop) => {
    const stream = streamToStop || localScreenStream;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    setLocalScreenStream(null);
    setScreenSharing(false);

    for (const peerId of Object.keys(pcs.current)) {
      const pc = pcs.current[peerId];
      const sender = screenSenders.current[peerId];
      if (sender) {
        try {
          pc.removeTrack(sender);
        } catch (e) {
          console.warn(`Failed to remove screen track for peer ${peerId}:`, e);
        }
        delete screenSenders.current[peerId];
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendMessage({
          type: 'offer',
          to: peerId,
          sdp: pc.localDescription.sdp
        });
      } catch (err) {
        console.error(`Failed to renegotiate offer after stopping screen share for peer ${peerId}:`, err);
      }
    }
  };

  // Toggle screen share (Host only)
  const toggleScreenSharing = async () => {
    const isActuallyHost = myPeerId && hostId && myPeerId === hostId;
    if (!isActuallyHost) {
      console.warn("Only the host is authorized to share screen");
      return;
    }
    if (screenSharing || localScreenStream) {
      await handleStopScreenShare(localScreenStream);
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

        const videoTrack = stream.getVideoTracks()[0];

        // Add screen tracks to all peer connections and renegotiate
        for (const peerId of Object.keys(pcs.current)) {
          const pc = pcs.current[peerId];
          if (videoTrack) {
            try {
              const oldSender = screenSenders.current[peerId];
              if (oldSender) {
                pc.removeTrack(oldSender);
              }
              const sender = pc.addTrack(videoTrack, stream);
              screenSenders.current[peerId] = sender;
            } catch (e) {
              console.warn(`Failed to add screen track for peer ${peerId}:`, e);
            }
          }

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
        if (stream.getVideoTracks()[0]) {
          stream.getVideoTracks()[0].onended = () => {
            handleStopScreenShare(stream);
          };
        }
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
    remoteVideoStreams,
    localMicStream,
    localScreenStream,
    micMuted,
    roomMuted,
    screenSharing,
    myPeerId,
    hostId,
    isHost: myPeerId !== '' && hostId !== '' && myPeerId === hostId,
    resolution,
    chatMessages,
    connecting,
    connectionError,
    toggleMic: () => muteLocalMicrophone(),
    toggleRoomMuted: () => setRoomMuted(prev => !prev),
    toggleScreenSharing,
    hostMuteEveryone,
    sendChatMessage
  };
}
