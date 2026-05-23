import React, { useEffect, useRef } from 'react';
import { Tv } from 'lucide-react';

export default function VideoGrid({ localScreenStream, remoteStreams, hostId, isHost }) {
  const videoRef = useRef(null);

  // Find host's screen stream. If we are host, use local. Otherwise, find in remote.
  const activeStream = isHost ? localScreenStream : remoteStreams[hostId];
  
  // Verify if it contains an active video track
  const hasVideoTrack = activeStream && activeStream.getVideoTracks().some(track => track.readyState === 'live');

  useEffect(() => {
    if (videoRef.current) {
      if (activeStream && hasVideoTrack) {
        videoRef.current.srcObject = activeStream;
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [activeStream, hasVideoTrack]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center">
      {activeStream && hasVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isHost}
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center text-center p-8 space-y-4">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10 animate-pulse">
            <Tv className="w-10 h-10 text-violet-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">No Active Screen Share</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-sm">
              {isHost
                ? "Click 'Share Screen' in the toolbar to start sharing with your guests."
                : "Waiting for the host to start sharing their screen..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
