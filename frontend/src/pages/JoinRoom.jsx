import React, { useState } from 'react';
import { Tv, ShieldAlert, LogIn } from 'lucide-react';

export default function JoinRoom({ roomId, onJoin }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a display name');
      return;
    }
    onJoin(name.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-transparent">
      <div className="w-full max-w-md glass-panel p-8 glow-border">
        {/* Title/Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-violet-500 to-indigo-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-violet-500/20">
            <Tv className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 text-glow">
            Join Watch Party
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Enter your display name to join room <span className="font-bold text-violet-400 px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded-md tracking-widest">{roomId}</span>
          </p>
        </div>

        {/* Join Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Your Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="e.g. Ghanendra"
              className="input-glass"
              maxLength={20}
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-500/20 p-3 rounded-lg">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full btn-primary py-3"
          >
            <LogIn className="w-5 h-5" />
            <span>Join Party</span>
          </button>
        </form>
      </div>
    </div>
  );
}
