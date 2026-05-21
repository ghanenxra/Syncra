import React, { useEffect, useRef } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import VideoGrid from '../components/VideoGrid';
import ChatPanel from '../components/ChatPanel';
import VoiceControls from '../components/VoiceControls';
import { Tv, Crown, Mic, MicOff, ShieldAlert } from 'lucide-react';

// Subcomponent to play remote audio streams
function RemoteAudio({ stream }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline />;
}

export default function Room({ roomId, displayName }) {
  const {
    peers,
    remoteStreams,
    localMicStream,
    localScreenStream,
    micMuted,
    screenSharing,
    myPeerId,
    hostId,
    isHost,
    resolution,
    chatMessages,
    toggleMic,
    toggleScreenSharing,
    hostMuteEveryone,
    sendChatMessage
  } = useWebRTC(roomId, displayName);

  return (
    <div className="w-screen h-screen flex flex-col p-4 gap-4 overflow-hidden">
      {/* Top Header Row */}
      <header className="flex items-center justify-between px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight text-glow">Syncra Party</h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Room ID: <span className="text-slate-300 font-mono select-all">{roomId}</span></span>
              <span>•</span>
              <span className="bg-violet-500/10 border border-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
                {resolution}
              </span>
            </div>
          </div>
        </div>

        {/* User identification */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl px-4 py-2">
          <div className="flex flex-col items-end">
            <span className="text-xs font-semibold">{displayName} (You)</span>
            <span className="text-[10px] text-slate-500">{isHost ? 'Host' : 'Guest'}</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center font-bold text-xs text-violet-400">
            {displayName.substring(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left Area: Theater Stream + Peer Avatars + Controls */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Theater Stream */}
          <div className="flex-1 min-h-0">
            <VideoGrid
              localScreenStream={localScreenStream}
              remoteStreams={remoteStreams}
              hostId={hostId}
              isHost={isHost}
            />
          </div>

          {/* Connected Peers list */}
          <div className="flex flex-wrap gap-2 shrink-0">
            {peers.map((peer) => {
              const isPeerMe = peer.id === myPeerId;
              const isPeerHost = peer.id === hostId;
              const isPeerMuted = isPeerMe ? micMuted : false; // Simplification, standard WebRTC handles track active
              
              return (
                <div
                  key={peer.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                    isPeerHost
                      ? 'bg-amber-500/5 border-amber-500/20 text-amber-300'
                      : 'bg-white/5 border-white/5 text-slate-300'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                    isPeerHost ? 'bg-amber-500/20' : 'bg-violet-500/20 text-violet-400'
                  }`}>
                    {peer.displayName.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs font-semibold">{peer.displayName}</span>
                  
                  {isPeerHost && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                  {isPeerMuted && <MicOff className="w-3 h-3 text-red-400 shrink-0" />}
                </div>
              );
            })}
          </div>

          {/* Voice Toolbar */}
          <div className="shrink-0">
            <VoiceControls
              micMuted={micMuted}
              toggleMic={toggleMic}
              screenSharing={screenSharing}
              toggleScreenSharing={toggleScreenSharing}
              isHost={isHost}
              hostMuteEveryone={hostMuteEveryone}
              roomId={roomId}
            />
          </div>
        </div>

        {/* Right Area: Chat Sidebar */}
        <aside className="w-80 shrink-0">
          <ChatPanel
            chatMessages={chatMessages}
            sendChatMessage={sendChatMessage}
            peers={peers}
            hostId={hostId}
            myPeerId={myPeerId}
          />
        </aside>
      </div>

      {/* Hidden Audio Nodes for playing remote voice streams */}
      {Object.entries(remoteStreams).map(([peerId, stream]) => {
        // Only attach audio streams if they contain audio tracks
        const hasAudio = stream.getAudioTracks().length > 0;
        if (!hasAudio) return null;
        return <RemoteAudio key={peerId} stream={stream} />;
      })}
    </div>
  );
}
