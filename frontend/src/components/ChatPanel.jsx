import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, Crown } from 'lucide-react';

export default function ChatPanel({ chatMessages, sendChatMessage, peers, hostId, myPeerId }) {
  const [text, setText] = useState('');
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
    <div className="flex flex-col h-full glass-panel border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-violet-400" />
          <span className="font-semibold text-sm">Room Chat</span>
        </div>
        <span className="text-xs bg-violet-500/10 border border-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full font-bold">
          {peers.length} online
        </span>
      </div>

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
