import React, { useState } from 'react';
import { Mic, MicOff, Monitor, MonitorOff, Copy, LogOut, VolumeX, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function VoiceControls({
  micMuted,
  toggleMic,
  screenSharing,
  toggleScreenSharing,
  isHost,
  hostMuteEveryone,
  roomId
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
    <div className="glass-panel px-6 py-3 flex items-center justify-between gap-4 border border-white/5 bg-white/2">
      {/* Left: Invite link */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">Room Code</span>
          <span className="text-sm font-extrabold text-violet-400 tracking-wider leading-none">{roomId}</span>
        </div>
        <button
          onClick={handleCopyLink}
          className="btn-icon text-slate-300 hover:text-white"
          title="Copy Invite Link"
        >
          {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
        </button>
      </div>

      {/* Center: Audio/Video Controls */}
      <div className="flex items-center gap-3">
        {/* Toggle Mic */}
        <button
          onClick={toggleMic}
          className={`btn-icon ${micMuted ? 'danger-active' : 'text-slate-300 hover:text-white'}`}
          title={micMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
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
            className="btn-icon text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-rose-500/20"
            title="Mute Everyone"
          >
            <VolumeX className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Right: Leave room */}
      <div>
        <button
          onClick={handleLeave}
          className="btn-danger flex items-center gap-2 py-2 px-4 text-sm"
          title="Leave Room"
        >
          <LogOut className="w-4 h-4" />
          <span>Leave</span>
        </button>
      </div>
    </div>
  );
}
