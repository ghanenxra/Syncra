import React, { useState } from 'react';
import { Mic, MicOff, Monitor, MonitorOff, Copy, LogOut, VolumeX, Volume2, Check, MessageSquare, Maximize, Minimize } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function VoiceControls({
  micMuted,
  toggleMic,
  roomMuted,
  toggleRoomMuted,
  screenSharing,
  toggleScreenSharing,
  isHost,
  hostMuteEveryone,
  roomId,
  isChatOpen,
  toggleChat,
  isFullscreen,
  toggleFullscreen
}) {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const handleCopyLink = () => {
    const inviteLink = `${window.location.origin}/r/${roomId}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLeave = () => {
    sessionStorage.removeItem('displayName');
    navigate('/');
  };

  return (
    <div className="voice-controls-panel">
      {/* Left: Invite link */}
      <div className="flex items-center gap-2 controls-left">
        <div className="flex flex-col">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1 room-code-label">Room Code</span>
          <span className="text-xs font-extrabold text-violet-400 tracking-wider leading-none">{roomId}</span>
        </div>
        <button
          onClick={handleCopyLink}
          className="btn-icon text-slate-300 hover:text-white"
          style={{ width: '32px', height: '32px', borderRadius: '6px' }}
          title="Copy Invite Link"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Center: Audio/Video/Chat/Fullscreen Controls */}
      <div className="flex items-center gap-2.5">
        {/* Toggle Mic */}
        <button
          onClick={toggleMic}
          className={`btn-icon ${micMuted ? 'danger-active' : 'text-slate-300 hover:text-white'}`}
          title={micMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Speaker Mute */}
        <button
          onClick={toggleRoomMuted}
          className={`btn-icon ${roomMuted ? 'danger-active' : 'text-slate-300 hover:text-white'}`}
          title={roomMuted ? 'Unmute Speaker' : 'Mute Speaker'}
        >
          {roomMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        {/* Toggle Screen Share (Host only) */}
        {isHost && (
          <button
            onClick={toggleScreenSharing}
            className={`btn-icon ${screenSharing ? 'active' : 'text-slate-300 hover:text-white'}`}
            title={screenSharing ? 'Stop Screen Share' : 'Share Screen'}
          >
            {screenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </button>
        )}

        {/* Host only Mute Everyone */}
        {isHost && (
          <button
            onClick={hostMuteEveryone}
            className="btn-mute-everyone text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-rose-500/20 flex items-center gap-1.5 px-3"
            title="Mute Everyone"
          >
            <MicOff className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wide mute-all-text">Mute All</span>
          </button>
        )}

        {/* Chat Toggle */}
        <button
          onClick={toggleChat}
          className={`btn-icon ${isChatOpen ? 'active' : 'text-slate-300 hover:text-white'}`}
          title={isChatOpen ? 'Hide Chat' : 'Show Chat'}
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className={`btn-icon ${isFullscreen ? 'active' : 'text-slate-300 hover:text-white'}`}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>

      {/* Right: Leave room */}
      <div>
        <button
          onClick={handleLeave}
          className="btn-danger flex items-center gap-2 py-2 px-3 text-xs"
          style={{ height: '36px', padding: '0 12px' }}
          title="Leave Room"
        >
          <LogOut className="w-4 h-4" />
          <span className="leave-text">Leave</span>
        </button>
      </div>
    </div>
  );
}
