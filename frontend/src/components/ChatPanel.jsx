import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, Crown, X } from 'lucide-react';

export default function ChatPanel({ chatMessages, sendChatMessage, peers, hostId, myPeerId }) {
  const [text, setText] = useState('');
  const [showOnlineList, setShowOnlineList] = useState(false);
  const messagesEndRef = useRef(null);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendChatMessage(text);
    setText('');
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  return (
    <div className="flex flex-col h-full glass-panel border border-white/5 overflow-hidden relative" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-violet-400" />
          <span className="font-semibold text-sm">Room Chat</span>
        </div>
        <button
          type="button"
          onClick={() => setShowOnlineList(!showOnlineList)}
          className="text-xs bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-400 px-2.5 py-1 rounded-full font-bold transition-all cursor-pointer flex items-center gap-1"
          style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', cursor: 'pointer' }}
        >
          <span>{peers.length} online</span>
        </button>
      </div>

      {/* Online Users List Dropdown/Popover */}
      {showOnlineList && (
        <div className="absolute right-4 top-14 w-60 glass-panel p-3 border border-white/10 shadow-xl z-50 animate-slide-up" style={{ background: 'var(--panel-bg)', backdropFilter: 'blur(20px)', borderRadius: '12px' }}>
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Online Members ({peers.length})</span>
            <button 
              type="button" 
              onClick={() => setShowOnlineList(false)}
              className="text-slate-400 hover:text-white"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {peers.map((peer) => {
              const isPeerHost = peer.id === hostId;
              const isPeerMe = peer.id === myPeerId;
              return (
                <div key={peer.id} className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-white/2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="flex items-center gap-2 min-w-0" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold`} style={{ display: 'flex', width: '20px', height: '20px', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: isPeerHost ? 'rgba(245, 158, 11, 0.2)' : 'rgba(139, 92, 246, 0.2)', color: isPeerHost ? '#fde047' : '#a78bfa' }}>
                      {peer.displayName.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium text-slate-200 truncate" style={{ fontSize: '12px' }}>
                      {peer.displayName} {isPeerMe && <span className="text-[10px] text-slate-500 font-normal">(You)</span>}
                    </span>
                  </div>
                  {isPeerHost && (
                    <Crown className="w-3 h-3 text-amber-400 shrink-0" style={{ color: '#fbbf24' }} title="Host" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 text-sm">
            <p>No messages yet.</p>
            <p className="text-xs mt-1">Say hello to the party!</p>
          </div>
        ) : (
          chatMessages.map((msg, i) => {
            const isMe = msg.from === myPeerId;
            const isHost = msg.from === hostId;
            return (
              <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-semibold text-slate-400">
                    {msg.displayName}
                  </span>
                  {isHost && (
                    <Crown className="w-3 h-3 text-amber-400 shrink-0" title="Host" />
                  )}
                  <span className="text-[10px] text-slate-600">
                    {msg.timestamp}
                  </span>
                </div>
                <div
                  className={`px-3 py-2 rounded-xl text-sm max-w-[85%] break-words ${
                    isMe
                      ? 'bg-violet-600 text-white rounded-tr-none'
                      : 'bg-white/5 text-slate-200 rounded-tl-none border border-white/5'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/5 bg-white/2 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message..."
          className="flex-1 input-glass py-2 px-3 text-sm"
          maxLength={200}
        />
        <button type="submit" className="btn-primary py-2 px-3 shrink-0">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
