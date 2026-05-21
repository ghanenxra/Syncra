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
    <div className="home-container">
      {/* Decorative ambient glowing circles */}
      <div className="ambient-glow-1" />
      <div className="ambient-glow-2" />
      
      <div className="modal-content glow-border animate-slide-up" style={{ position: 'relative' }}>
        {/* Title/Header */}
        <div className="modal-header">
          <div className="card-icon-wrapper-1" style={{ margin: '0 auto 1.5rem', width: '4rem', height: '4rem' }}>
            <Tv className="w-8 h-8 text-white" />
          </div>
          <h1 className="modal-title">Join Watch Party</h1>
          <p className="modal-subtitle">
            Enter your display name to join room <span className="font-bold text-violet-400 px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded-md tracking-widest">{roomId}</span>
          </p>
        </div>

        {/* Join Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2" style={{ textAlign: 'left' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
            <div className="flex items-center gap-2" style={{ fontSize: '12px', color: '#f87171', background: 'rgba(127, 29, 29, 0.2)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full btn-primary py-3"
            style={{ marginTop: '0.5rem' }}
          >
            <LogIn className="w-5 h-5" />
            <span>Join Party</span>
          </button>
        </form>
      </div>
    </div>
  );
}
