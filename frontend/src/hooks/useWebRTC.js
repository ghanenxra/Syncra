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

  const pc = useRef(null); // SINGLE RTCPeerConnection to Cloudflare Calls SFU
  const sessionIdRef = useRef(''); // Local Cloudflare Session ID
  const midToTrackMap = useRef({}); // mid -> { peerId, trackName }

  const localScreenStreamRef = useRef(null);
  const localCameraStreamRef = useRef(null);
  const myPeerIdRef = useRef('');
  const hostIdRef = useRef('');
  const peersRef = useRef([]);

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

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  // Static ICE Servers configuration (used to connect to Cloudflare)
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

  // Creates a dark placeholder track to publish when camera is not present
  const createBlankVideoTrack = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0c0b14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Camera Offline', canvas.width / 2, canvas.height / 2);

    const stream = canvas.captureStream(30);
    return stream.getVideoTracks()[0];
  };

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
          console.warn('Failed to access camera, fallback to mock black track:', err);
          audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          cameraStream = new MediaStream([createBlankVideoTrack()]);
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
      console.error('Failed to access media devices, generating mock audio:', err);
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
      return { audioStream, cameraStream: null };
    }
  };

  // Helper to clean up connection
  const cleanUp = useCallback(() => {
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
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

  // Request Cloudflare subscription for remote tracks list
  const subscribeToTracks = (tracksList) => {
    if (!tracksList || tracksList.length === 0) return;
    
    // Filter out our own tracks
    const remoteTracks = tracksList.filter(t => t.sessionId !== sessionIdRef.current && t.sessionId !== myPeerIdRef.current);
    if (remoteTracks.length === 0) return;

    console.log('Subscribing to remote tracks:', remoteTracks);
    sendMessage({
      type: 'cf-subscribe-tracks',
      tracks: remoteTracks.map(t => ({
        location: 'remote',
        sessionId: t.sessionId,
        trackId: t.trackId,
        trackName: t.trackName
      }))
    });
  };

  // Triggers ICE restart with Cloudflare Calls SFU
  const handleIceRestart = async () => {
    if (!pc.current) return;
    console.warn('WebRTC connection state lost. Initiating ICE restart renegotiation...');
    try {
      pc.current.restartIce();
      const offer = await pc.current.createOffer({ iceRestart: true });
      await pc.current.setLocalDescription(offer);
      sendMessage({
        type: 'cf-renegotiate',
        sdp: pc.current.localDescription.sdp,
        sdpType: 'offer'
      });
    } catch (e) {
      console.error('Failed to perform ICE restart renegotiation:', e);
    }
  };

  // Setup Peer Connection event handlers
  const setupPeerConnection = (pcInstance) => {
    // ICE candidate discovery
    pcInstance.onicecandidate = (event) => {
      // Cloudflare Calls handles ICE candidate gathering on session description exchange,
      // but standard ICE candidates are forwarded to ensure stability.
      if (event.candidate) {
        sendMessage({
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };

    // Track arrival (demuxing remote feeds from Cloudflare)
    pcInstance.ontrack = (event) => {
      const mid = event.transceiver.mid;
      const trackInfo = midToTrackMap.current[mid];
      const peerId = trackInfo ? trackInfo.peerId : 'unknown';
      const trackName = trackInfo ? trackInfo.trackName : (event.track.kind === 'video' ? 'video-cam' : 'audio-mic');

      console.log(`Track arrived: kind=${event.track.kind}, mid=${mid}, peer=${peerId}, name=${trackName}`);

      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      
      if (event.track.kind === 'audio') {
        setRemoteStreams(prev => ({ ...prev, [peerId]: remoteStream }));
        
        event.track.onended = () => {
          console.log(`Audio track ended for peer ${peerId}`);
          setRemoteStreams(prev => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        };
      } else if (event.track.kind === 'video') {
        setRemoteVideoStreams(prev => ({ ...prev, [peerId]: remoteStream }));

        event.track.onended = () => {
          console.log(`Video track ended for peer ${peerId}`);
          setRemoteVideoStreams(prev => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        };
      }
    };

    // Connection Health Monitor
    pcInstance.onconnectionstatechange = () => {
      console.log('WebRTC connection state changed:', pcInstance.connectionState);
      if (pcInstance.connectionState === 'disconnected' || pcInstance.connectionState === 'failed') {
        handleIceRestart();
      }
    };
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
        
        // Populate peer lists
        const isHostUser = msg.from === msg.hostId;
        const updatedPeers = [
          { id: msg.from, displayName: displayName, isHost: isHostUser },
          ...msg.peers
        ];
        setPeers(updatedPeers);

        // Get local streams
        const { audioStream, cameraStream } = await initLocalMedia(isHostUser);

        // Create the single peer connection to Cloudflare
        const configIce = getIceServers();
        const localPc = new RTCPeerConnection({ iceServers: configIce });
        pc.current = localPc;
        setupPeerConnection(localPc);

        // Add local tracks (Host: mic + camera/mock; Guest: mic + recvonly video)
        if (audioStream) {
          audioStream.getTracks().forEach(track => localPc.addTrack(track, audioStream));
        }

        if (isHostUser) {
          const activeVideoTrack = cameraStream ? cameraStream.getVideoTracks()[0] : null;
          if (activeVideoTrack) {
            localPc.addTrack(activeVideoTrack, cameraStream);
          }
        } else {
          localPc.addTransceiver('video', { direction: 'recvonly' });
        }

        // Create local session offer and send to Cloudflare
        try {
          const offer = await localPc.createOffer();
          await localPc.setLocalDescription(offer);
          sendMessage({
            type: 'cf-create-session',
            sdp: localPc.localDescription.sdp
          });
        } catch (err) {
          console.error('Failed to create local Cloudflare session offer:', err);
        }
        break;

      case 'cf-session-created':
        sessionIdRef.current = msg.sessionId;
        console.log('Cloudflare WebRTC session created:', msg.sessionId);
        
        // Complete handshake
        if (pc.current) {
          try {
            await pc.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
          } catch (err) {
            console.error('Failed to set remote session description answer:', err);
          }

          // Publish our tracks to Cloudflare
          const tracksToPublish = [];
          pc.current.getSenders().forEach(sender => {
            if (sender.track) {
              tracksToPublish.push({
                location: 'local',
                mid: sender.track.kind === 'video' ? '1' : '0',
                trackName: sender.track.kind === 'video' ? 'video-cam' : 'audio-mic'
              });
            }
          });

          if (tracksToPublish.length > 0) {
            sendMessage({
              type: 'cf-publish-tracks',
              tracks: tracksToPublish
            });
          }
        }

        // Guests subscribe to any existing tracks in the room
        const isMeHost = myPeerIdRef.current === hostIdRef.current;
        if (!isMeHost && msg.tracks && msg.tracks.length > 0) {
          subscribeToTracks(msg.tracks);
        }
        break;

      case 'cf-tracks-published':
        console.log('Published local tracks successfully:', msg.tracks);
        break;

      case 'peer-published-tracks':
        console.log('Peer published tracks:', msg.from, msg.tracks);
        // Map published tracks to peer Details
        setPeers(prev => prev.map(p => {
          if (p.id === msg.from) {
            return { ...p, publishedTracks: msg.tracks, sessionId: msg.sessionId };
          }
          return p;
        }));

        // Subscribe to these remote tracks
        subscribeToTracks(msg.tracks.map(t => ({
          sessionId: msg.sessionId,
          trackId: t.trackId,
          trackName: t.trackName
        })));
        break;

      case 'cf-tracks-subscribed':
        console.log('Received subscription offer for remote tracks');
        msg.tracks.forEach(t => {
          const publishingPeer = peersRef.current.find(p => p.sessionId === t.sessionId || p.id === t.sessionId);
          const peerId = publishingPeer ? publishingPeer.id : 'unknown';
          midToTrackMap.current[t.mid] = { peerId, trackName: t.trackName };
        });

        // Set remote offer and reply with local description answer
        if (pc.current) {
          try {
            await pc.current.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            sendMessage({
              type: 'cf-renegotiate',
              sdp: pc.current.localDescription.sdp,
              sdpType: 'answer'
            });
          } catch (err) {
            console.error('Failed to subscribe remote tracks:', err);
          }
        }
        break;

      case 'cf-renegotiated':
        if (msg.sdp && pc.current) {
          console.log('Completing local-initiated renegotiation...');
          try {
            await pc.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
          } catch (err) {
            console.error('Failed to set remote description on renegotiated answer:', err);
          }
        }
        break;

      case 'peer-closed-tracks':
        console.log('Peer closed tracks:', msg.from, msg.tracks);
        msg.tracks.forEach(t => {
          Object.entries(midToTrackMap.current).forEach(([mid, info]) => {
            if (info.peerId === msg.from) {
              if (info.trackName === 'video-cam') {
                setRemoteVideoStreams(prev => {
                  const next = { ...prev };
                  delete next[msg.from];
                  return next;
                });
              } else if (info.trackName === 'audio-mic') {
                setRemoteStreams(prev => {
                  const next = { ...prev };
                  delete next[msg.from];
                  return next;
                });
              }
            }
          });
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

    if (pc.current) {
      const videoSender = pc.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        try {
          await videoSender.replaceTrack(cameraTrack);
        } catch (e) {
          console.warn('Failed to replace track back to camera:', e);
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

        // Replace track on the video sender
        if (pc.current) {
          const videoSender = pc.current.getSenders().find(s => s.track && s.track.kind === 'video');
          if (videoSender && screenTrack) {
            try {
              await videoSender.replaceTrack(screenTrack);
            } catch (e) {
              console.warn('Failed to replace track with screen share:', e);
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
