import { useEffect, useRef, useState, useCallback } from 'react';
import { useSignaling } from './useSignaling';

export function useWebRTC(roomId, displayName) {
  const [peers, setPeers] = useState([]); // Array of PeerInfo
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> MediaStream (Audio)
  const [remoteVideoStreams, setRemoteVideoStreams] = useState({}); // peerId -> MediaStream (Video/Screen Share)
  const [localMicStream, setLocalMicStream] = useState(null);
  const [localCameraStream, setLocalCameraStream] = useState(null);
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
  const makingOffers = useRef({}); // peerId -> boolean

  const localScreenStreamRef = useRef(null);
  const localCameraStreamRef = useRef(null);
  const myPeerIdRef = useRef('');
  const hostIdRef = useRef('');

  useEffect(() => {
    localScreenStreamRef.current = localScreenStream;
  }, [localScreenStream]);

  useEffect(() => {
    localCameraStreamRef.current = localCameraStream;
  }, [localCameraStream]);

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

  // Helper to initialize local microphone (and camera video if Host)
  const initLocalMedia = async (isHostUser) => {
    try {
      if (isHostUser) {
        console.log('Initializing Host media (microphone + camera)...');
        let audioStream, cameraStream;
        
        try {
          const combinedStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { width: 1280, height: 720 }
          });
          audioStream = new MediaStream(combinedStream.getAudioTracks());
          cameraStream = new MediaStream(combinedStream.getVideoTracks());
        } catch (err) {
          console.warn('Failed to access camera, fallback to audio only:', err);
          audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          cameraStream = null;
        }

        if (micMuted) {
          const audioTrack = audioStream.getAudioTracks()[0];
          if (audioTrack) audioTrack.enabled = false;
        }

        setLocalMicStream(audioStream);
        setLocalCameraStream(cameraStream);
        return { audioStream, cameraStream };
      } else {
        console.log('Initializing Guest media (microphone only)...');
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (micMuted) {
          const audioTrack = audioStream.getAudioTracks()[0];
          if (audioTrack) audioTrack.enabled = false;
        }
        setLocalMicStream(audioStream);
        return { audioStream, cameraStream: null };
      }
    } catch (err) {
      console.error('Failed to access media devices:', err);
      // Fallback mock audio context stream
      const mockCtx = new (window.AudioContext || window.webkitAudioContext)();
      const mockOsc = mockCtx.createOscillator();
      const mockDst = mockCtx.createMediaStreamDestination();
      mockOsc.connect(mockDst);
      const audioStream = mockDst.stream;
      if (micMuted) {
        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = false;
      }
      setLocalMicStream(audioStream);
      return { audioStream: audioStream, cameraStream: null };
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
    if (localCameraStreamRef.current) {
      localCameraStreamRef.current.getTracks().forEach(t => t.stop());
    }
  }, [localMicStream, localScreenStream]);

  // Create RTCPeerConnection for a remote peer
  const createPeerConnection = async (peerId, remoteName, isInitiator, audioStream, videoStream) => {
    if (pcs.current[peerId]) {
      pcs.current[peerId].close();
    }

    const configIce = getIceServers();
    const pc = new RTCPeerConnection({ iceServers: configIce });
    pcs.current[peerId] = pc;
    makingOffers.current[peerId] = false;

    const isActuallyHost = myPeerIdRef.current && hostIdRef.current && myPeerIdRef.current === hostIdRef.current;

    // Attach local audio/video based on Host/Guest constraints
    if (isActuallyHost) {
      // Host audio
      if (audioStream) {
        audioStream.getTracks().forEach(track => {
          pc.addTrack(track, audioStream);
        });
      }
      // Host video
      const activeVideoTrack = videoStream ? videoStream.getVideoTracks()[0] : null;
      if (activeVideoTrack) {
        try {
          const sender = pc.addTrack(activeVideoTrack, videoStream);
          screenSenders.current[peerId] = sender;
        } catch (e) {
          console.warn('Failed to add Host video track:', e);
        }
      }
    } else {
      // Guest strictly audio only
      if (audioStream) {
        audioStream.getTracks().forEach(track => {
          pc.addTrack(track, audioStream);
        });
      }
      // Add receive-only video transceiver for Guest
      try {
        pc.addTransceiver('video', { direction: 'recvonly' });
      } catch (e) {
        console.warn('Failed to add receive-only video transceiver:', e);
      }
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

    // Track arrival callback (Demuxing audio/video independently)
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || (event.track ? new MediaStream([event.track]) : null);
      if (!remoteStream) return;

      if (event.track.kind === 'audio') {
        console.log(`Audio track arrived from peer ${peerId}`);
        setRemoteStreams(prev => ({ ...prev, [peerId]: remoteStream }));

        const tracks = remoteStream.getAudioTracks();
        if (event.track && !tracks.includes(event.track)) {
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
        });
      }

      if (event.track.kind === 'video') {
        console.log(`Video track arrived from peer ${peerId}`);
        setRemoteVideoStreams(prev => ({ ...prev, [peerId]: remoteStream }));

        const tracks = remoteStream.getVideoTracks();
        if (event.track && !tracks.includes(event.track)) {
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
        });
      }
    };

    // Self-Healing & ICE Reconnection State Machine
    pc.onconnectionstatechange = () => {
      console.log(`Connection state change with ${remoteName}:`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.warn(`Connection with ${remoteName} lost. Initiating ICE restart...`);
        try {
          pc.restartIce();
          
          if (!isActuallyHost) {
            // Guests notify host that renegotiation is required
            sendMessage({
              type: 'ice-restart-needed',
              to: hostIdRef.current
            });
          }
        } catch (e) {
          console.error(`Failed to restart ICE for peer ${peerId}:`, e);
        }
      }

      if (pc.connectionState === 'closed') {
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

    // Perfect Negotiation pattern
    pc.onnegotiationneeded = async () => {
      try {
        makingOffers.current[peerId] = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendMessage({
          type: 'offer',
          to: peerId,
          sdp: pc.localDescription.sdp
        });
      } catch (err) {
        console.error(`Negotiation needed failed for peer ${peerId}:`, err);
      } finally {
        makingOffers.current[peerId] = false;
      }
    };

    if (isInitiator) {
      // Let onnegotiationneeded naturally trigger the initial offer
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

        // Get local devices
        const isHostUser = msg.from === msg.hostId;
        const { audioStream, cameraStream } = await initLocalMedia(isHostUser);

        // Connect to existing peers (we initiate to them)
        for (const peer of msg.peers) {
          const activeVideoStream = isHostUser ? cameraStream : null;
          await createPeerConnection(peer.id, peer.displayName, true, audioStream, activeVideoStream);
        }

        // Broadcast our current mute status to the room
        sendMessage({
          type: 'mute-status',
          muted: micMuted
        });
        break;

      case 'peer-joined':
        setPeers(prev => [...prev, { id: msg.from, displayName: msg.displayName, isHost: msg.isHost }]);
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
        const isHostMe = myPeerIdRef.current === hostIdRef.current;
        if (!pcOffer) {
          const activeVideoStream = isHostMe ? (localScreenStreamRef.current || localCameraStreamRef.current) : null;
          pcOffer = await createPeerConnection(msg.from, 'Peer', false, localMicStream, activeVideoStream);
        }

        // Perfect Negotiation Collision Resolution
        const polite = !isHostMe;
        const collision = makingOffers.current[msg.from] || pcOffer.signalingState !== 'stable';
        const ignoreOffer = !polite && collision;

        if (ignoreOffer) {
          console.log(`[Perfect Negotiation] Host ignoring colliding offer from peer ${msg.from}`);
          break;
        }

        try {
          if (collision) {
            console.log(`[Perfect Negotiation] Guest rolling back colliding offer for peer ${msg.from}`);
            await pcOffer.setLocalDescription({ type: 'rollback' });
          }
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

      case 'ice-restart-needed':
        if (myPeerIdRef.current === hostIdRef.current) {
          console.log(`Host received ICE restart request from guest peer: ${msg.from}`);
          const pcToRestart = pcs.current[msg.from];
          if (pcToRestart) {
            try {
              const offer = await pcToRestart.createOffer({ iceRestart: true });
              await pcToRestart.setLocalDescription(offer);
              sendMessage({
                type: 'offer',
                to: msg.from,
                sdp: pcToRestart.localDescription.sdp
              });
            } catch (err) {
              console.error(`Failed to negotiate ICE restart for guest ${msg.from}:`, err);
            }
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
        if (myPeerIdRef.current !== hostIdRef.current) {
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
          delete makingOffers.current[leavingId];
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

  // Hook up useSignaling
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

  // Helper to stop screen share and revert to camera video track
  const handleStopScreenShare = async (streamToStop) => {
    const stream = streamToStop || localScreenStream;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    setLocalScreenStream(null);
    setScreenSharing(false);

    const cameraTrack = localCameraStreamRef.current ? localCameraStreamRef.current.getVideoTracks()[0] : null;

    for (const peerId of Object.keys(pcs.current)) {
      const pc = pcs.current[peerId];
      if (pc) {
        const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          try {
            await videoSender.replaceTrack(cameraTrack);
          } catch (e) {
            console.warn(`Failed to replace track back to camera for peer ${peerId}:`, e);
          }
        }
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

        const screenTrack = stream.getVideoTracks()[0];

        // Replace track for all active peer connections
        for (const peerId of Object.keys(pcs.current)) {
          const pc = pcs.current[peerId];
          if (pc) {
            const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender && screenTrack) {
              try {
                await videoSender.replaceTrack(screenTrack);
              } catch (e) {
                console.warn(`Failed to replace track with screen for peer ${peerId}:`, e);
              }
            } else if (screenTrack) {
              try {
                const sender = pc.addTrack(screenTrack, stream);
                screenSenders.current[peerId] = sender;
              } catch (e) {
                console.warn(`Failed to add screen track for peer ${peerId}:`, e);
              }
            }
          }
        }

        // Setup end handler
        if (screenTrack) {
          screenTrack.onended = () => {
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
    localCameraStream,
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
