import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv, Monitor, Video, ShieldAlert, Sparkles, Key, Users, X, ArrowRight, Github, Coffee, Mail } from 'lucide-react';

export default function Home() {
  const [activeModal, setActiveModal] = useState(null); // 'host' or 'join'
  const [displayName, setDisplayName] = useState('');
  const [partyCode, setPartyCode] = useState('');
  const [resolution, setResolution] = useState('1080p60');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleHostRoom = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter a display name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/room/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resolution }),
      });

      if (!response.ok) {
        throw new Error('Failed to create watch party. Server might be down.');
      }

      const data = await response.json();
      sessionStorage.setItem('displayName', displayName.trim());
      navigate(`/r/${data.roomId}`);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Server connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!partyCode.trim()) {
      setError('Please enter a party code');
      return;
    }
    if (partyCode.trim().length !== 6) {
      setError('Party code must be exactly 6 characters');
      return;
    }
    if (!displayName.trim()) {
      setError('Please enter a display name');
      return;
    }

    sessionStorage.setItem('displayName', displayName.trim());
    navigate(`/r/${partyCode.trim().toUpperCase()}`);
  };

  const openModal = (mode) => {
    setActiveModal(mode);
    setError('');
    setDisplayName('');
    setPartyCode('');
  };

  const closeModal = () => {
    setActiveModal(null);
    setError('');
  };

  return (
    <div className="home-container">
      {/* Decorative ambient glowing circles */}
      <div className="ambient-glow-1" />
      <div className="ambient-glow-2" />

      {/* Main Container */}
      <div className="home-content">
        
        {/* Brand Header */}
        <div className="text-center animate-fade-in">
          <div className="beta-badge">
            <Sparkles style={{ width: '14px', height: '14px' }} />
            <span>Now in Beta</span>
          </div>
          <h1 className="title-gradient">
            Sync<span className="title-span">ra</span>
          </h1>
          <p className="home-subtitle">
            Low-latency watch parties with native screen sharing and crystal-clear voice chat.
          </p>
        </div>

        {/* Portal Cards (Host vs Join) */}
        <div className="portal-grid">
          
          {/* Card: Host */}
          <div 
            onClick={() => openModal('host')}
            className="portal-card glow-border"
          >
            <div className="card-icon-wrapper-1">
              <Tv style={{ width: '32px', height: '32px', color: '#fff' }} />
            </div>
            <h3 className="card-title">Host a Party</h3>
            <p className="card-desc">
              Start a new watch party, customize stream resolution, and invite your friends.
            </p>
            <div className="card-action-link">
              <span>Start session</span>
              <ArrowRight style={{ width: '16px', height: '16px' }} />
            </div>
          </div>

          {/* Card: Join */}
          <div 
            onClick={() => openModal('join')}
            className="portal-card glow-border"
          >
            <div className="card-icon-wrapper-2">
              <Users style={{ width: '32px', height: '32px', color: '#fff' }} />
            </div>
            <h3 className="card-title">Join a Party</h3>
            <p className="card-desc">
              Already have a party code? Paste it here to instantly enter your friend's room.
            </p>
            <div className="card-action-link" style={{ color: '#818cf8' }}>
              <span>Enter room code</span>
              <ArrowRight style={{ width: '16px', height: '16px' }} />
            </div>
          </div>

        </div>

        {/* Footer */}
        <footer className="home-footer">
          <a href="https://github.com/ghanenxra" target="_blank" rel="noopener noreferrer" className="footer-link">
            <Github style={{ width: '16px', height: '16px' }} />
            <span>GitHub</span>
          </a>
          <a href="https://www.paypal.com/paypalme/ghanenxra" target="_blank" rel="noopener noreferrer" className="footer-link">
            <Coffee style={{ width: '16px', height: '16px' }} />
            <span>Buy us a coffee</span>
          </a>
          <a href="mailto:ghanuprosepic@gmail.com" className="footer-link">
            <Mail style={{ width: '16px', height: '16px' }} />
            <span>Contact</span>
          </a>
        </footer>

      </div>

      {/* Portal Overlay Modal (In-Browser Window) */}
      {activeModal && (
        <div className="modal-overlay">
          <div className="modal-content glow-border animate-slide-up">
            
            {/* Close Button */}
            <button 
              onClick={closeModal}
              className="modal-close-btn"
            >
              <X style={{ width: '20px', height: '20px' }} />
            </button>

            {/* Modal Header */}
            <div className="modal-header">
              <h2 className="modal-title">
                {activeModal === 'host' ? 'Host Watch Party' : 'Join Watch Party'}
              </h2>
              <p className="modal-subtitle">
                {activeModal === 'host' 
                  ? 'Configure settings to start your stream' 
                  : 'Enter the 6-character room code to join'}
              </p>
            </div>

            {/* Modal Forms */}
            {activeModal === 'host' ? (
              <form onSubmit={handleHostRoom} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2" style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="input-glass"
                    maxLength={20}
                    autoFocus
                  />
                </div>

                <div className="flex flex-col gap-2" style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Target Resolution
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setResolution('1080p60')}
                      className={`resolution-btn ${resolution === '1080p60' ? 'active' : ''}`}
                    >
                      <Monitor style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '600' }}>1080p 60fps</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>Smooth</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setResolution('1080p30')}
                      className={`resolution-btn ${resolution === '1080p30' ? 'active' : ''}`}
                    >
                      <Video style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '600' }}>1080p 30fps</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>Eco Mode</div>
                      </div>
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2" style={{ fontSize: '12px', color: '#f87171', background: 'rgba(127, 29, 29, 0.2)', border: '1px solid rgba(248, 113, 113, 0.2)', padding: '12px', borderRadius: '8px' }}>
                    <ShieldAlert style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary"
                  style={{ padding: '12px' }}
                >
                  {loading ? 'Creating...' : 'Launch Watch Party'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoinRoom} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2" style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Party Code
                  </label>
                  <div className="relative" style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={partyCode}
                      onChange={(e) => setPartyCode(e.target.value.toUpperCase())}
                      placeholder="e.g. XK7F2Q"
                      className="input-glass w-full"
                      style={{ paddingLeft: '40px', letterSpacing: '0.15em', fontWeight: '700', fontFamily: 'monospace' }}
                      maxLength={6}
                      autoFocus
                    />
                    <Key style={{ width: '16px', height: '16px', color: '#64748b', position: 'absolute', left: '12px' }} />
                  </div>
                </div>

                <div className="flex flex-col gap-2" style={{ textAlign: 'left' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="input-glass"
                    maxLength={20}
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2" style={{ fontSize: '12px', color: '#f87171', background: 'rgba(127, 29, 29, 0.2)', border: '1px solid rgba(248, 113, 113, 0.2)', padding: '12px', borderRadius: '8px' }}>
                    <ShieldAlert style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full btn-primary"
                  style={{ padding: '12px' }}
                >
                  <span>Enter Watch Party</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
