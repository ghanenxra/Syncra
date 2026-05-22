import React, { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import VideoGrid from '../components/VideoGrid';
import ChatPanel from '../components/ChatPanel';
import VoiceControls from '../components/VoiceControls';
import { Tv, Crown, Mic, MicOff, ShieldAlert, X, Copy, Check, Sparkles, Loader2, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Subcomponent to play remote audio streams
function RemoteAudio({ stream, muted }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  return <audio ref={audioRef} autoPlay playsInline muted={muted} />;
}

export default function Room({ roomId, displayName }) {
  const {
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
    isHost,
    resolution,
    chatMessages,
    connecting,
    connectionError,
    toggleMic,
    toggleRoomMuted,
    toggleScreenSharing,
    hostMuteEveryone,
    sendChatMessage
  } = useWebRTC(roomId, displayName);

  const [showShareModal, setShowShareModal] = useState(false);
  const [hasOpenedShareModal, setHasOpenedShareModal] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(() => window.innerWidth >= 768);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const element = document.documentElement;
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  };

  useEffect(() => {
    if (isHost && !hasOpenedShareModal) {
      setShowShareModal(true);
      setHasOpenedShareModal(true);
    }
  }, [isHost, hasOpenedShareModal]);

  if (connecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white font-sans" style={{ background: '#090d16', minHeight: '100vh', display: 'flex', flexDirection: 'column', itemsAlign: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div className="glass-panel p-8 rounded-2xl flex flex-col items-center text-center space-y-6 glow-border animate-slide-up" style={{ width: '22rem', border: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)', padding: '2rem', borderRadius: '16px' }}>
          <div className="relative flex items-center justify-center w-16 h-16 bg-violet-600/10 rounded-full border border-violet-500/20" style={{ display: 'flex', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(124, 58, 237, 0.1)', border: '1px solid rgba(124, 58, 237, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" style={{ color: '#a78bfa' }} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-wide" style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Entering Party</h3>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed" style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              Setting up secure WebRTC connections. This will only take a moment...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white font-sans" style={{ background: '#090d16', minHeight: '100vh', display: 'flex', flexDirection: 'column', itemsAlign: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div className="glass-panel p-8 rounded-2xl flex flex-col items-center text-center space-y-6 border border-rose-500/20 animate-slide-up" style={{ width: '24rem', border: '1px solid rgba(239, 68, 68, 0.2)', backgroundColor: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)', padding: '2rem', borderRadius: '16px', boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.05)' }}>
          <div className="relative flex items-center justify-center w-16 h-16 bg-rose-600/10 rounded-full border border-rose-500/20" style={{ display: 'flex', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <WifiOff className="w-8 h-8 text-rose-400" style={{ color: '#f87171' }} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-wide" style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Connection Issue</h3>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed" style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              {connectionError}
            </p>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="btn-primary w-full py-3"
            style={{ width: '100%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            Go Back Home
          </button>
        </div>
      </div>
    );
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/r/${roomId}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  return (
    <div className="room-layout">
      {/* Top Header Row */}
      <header className="room-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20" style={{ borderRadius: '12px', display: 'flex', width: '40px', height: '40px', background: 'var(--primary)' }}>
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight text-glow" style={{ fontSize: '1.125rem', color: '#fff' }}>Syncra Party</h2>
            <div className="flex items-center gap-2" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>Room ID: <span className="font-mono select-all" style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{roomId}</span></span>
              <span>•</span>
              <span className="room-badge">
                {resolution}
              </span>
            </div>
          </div>
        </div>

        {/* User identification */}
        <div className="room-user-card">
          <div className="flex flex-col" style={{ alignItems: 'flex-end' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#fff' }}>{displayName} (You)</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{isHost ? 'Host' : 'Guest'}</span>
          </div>
          <div className="user-avatar">
            {displayName.substring(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="room-main">
        {/* Left Area: Theater Stream + Peer Avatars + Controls */}
        <div className="room-left">
          {/* Theater Stream */}
          <div className="flex-1" style={{ minHeight: 0 }}>
            <VideoGrid
              localScreenStream={localScreenStream}
              remoteStreams={remoteVideoStreams}
              hostId={hostId}
              isHost={isHost}
            />
          </div>

          {/* Connected Peers list */}
          <div className="peer-list">
            {peers.map((peer) => {
              const isPeerMe = peer.id === myPeerId;
              const isPeerHost = peer.id === hostId;
              const isPeerMuted = isPeerMe ? micMuted : (peer.muted || false);
              
              return (
                <div
                  key={peer.id}
                  className={`peer-card ${isPeerHost ? 'host' : ''} ${isPeerMuted ? 'muted' : ''}`}
                >
                  <div className={`peer-avatar ${isPeerHost ? 'host' : 'guest'} ${isPeerMuted ? 'muted' : ''}`}>
                    {peer.displayName.substring(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '600' }}>{peer.displayName}</span>
                  
                  {isPeerHost && <Crown className="w-3 h-3 text-amber-400 shrink-0" style={{ color: '#fbbf24' }} />}
                  {isPeerMuted && <MicOff className="w-3 h-3 text-red-400 shrink-0" style={{ color: '#f87171' }} />}
                </div>
              );
            })}
          </div>

          {/* Voice Toolbar */}
          <div className="shrink-0">
            <VoiceControls
              micMuted={micMuted}
              toggleMic={toggleMic}
              roomMuted={roomMuted}
              toggleRoomMuted={toggleRoomMuted}
              screenSharing={screenSharing}
              toggleScreenSharing={toggleScreenSharing}
              isHost={isHost}
              hostMuteEveryone={hostMuteEveryone}
              roomId={roomId}
              isChatOpen={isChatOpen}
              toggleChat={() => setIsChatOpen(!isChatOpen)}
              isFullscreen={isFullscreen}
              toggleFullscreen={toggleFullscreen}
            />
          </div>
        </div>

        {/* Right Area: Chat Sidebar */}
        {isChatOpen && (
          <aside className="room-right">
            <ChatPanel
              chatMessages={chatMessages}
              sendChatMessage={sendChatMessage}
              peers={peers}
              hostId={hostId}
              myPeerId={myPeerId}
              onClose={() => setIsChatOpen(false)}
            />
          </aside>
        )}
      </div>

      {/* Hidden Audio Nodes for playing remote voice streams */}
      {Object.entries(remoteStreams).map(([peerId, stream]) => {
        // Only attach audio streams if they contain audio tracks
        const hasAudio = stream && stream.getAudioTracks && stream.getAudioTracks().length > 0;
        if (!hasAudio) return null;
        return <RemoteAudio key={peerId} stream={stream} muted={roomMuted} />;
      })}

      {/* Share Party Code Modal (In-Browser Window) */}
      {showShareModal && (
        <div className="modal-overlay">
          <div className="modal-content glow-border animate-slide-up" style={{ maxWidth: '24rem', textAlign: 'center' }}>
            <button 
              onClick={() => setShowShareModal(false)}
              className="modal-close-btn"
            >
              <X style={{ width: '20px', height: '20px' }} />
            </button>
            <div className="modal-header">
              <div className="card-icon-wrapper-1" style={{ margin: '0 auto 1rem', width: '3.5rem', height: '3.5rem' }}>
                <Sparkles style={{ width: '24px', height: '24px', color: '#fff' }} />
              </div>
              <h2 className="modal-title">Party is Ready!</h2>
              <p className="modal-subtitle">Share this party code with your friends to start watching together.</p>
            </div>
            
            <div style={{ margin: '1.5rem 0' }}>
              <div className="room-code-display">
                {roomId}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleCopyCode} 
                className="btn-primary w-full py-3"
              >
                {codeCopied ? <Check style={{ width: '18px', height: '18px' }} /> : <Copy style={{ width: '18px', height: '18px' }} />}
                <span>{codeCopied ? 'Code Copied!' : 'Copy Party Code'}</span>
              </button>
              
              <button 
                onClick={handleCopyInviteLink} 
                className="w-full py-3 btn-icon" 
                style={{ height: 'auto', display: 'flex', gap: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', justifyContent: 'center' }}
              >
                {linkCopied ? <Check style={{ width: '18px', height: '18px', color: '#10b981' }} /> : <Tv style={{ width: '18px', height: '18px' }} />}
                <span>{linkCopied ? 'Link Copied!' : 'Copy Invite Link'}</span>
              </button>

              <button 
                onClick={() => setShowShareModal(false)} 
                className="w-full py-2 text-xs text-slate-400 hover:text-white"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginTop: '0.5rem' }}
              >
                Start Watching
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
