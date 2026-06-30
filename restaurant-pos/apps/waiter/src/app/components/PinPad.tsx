'use client';

import React, { useState } from 'react';

// ============================================================
// Reusable PIN Pad Component — frosted-glass, modern dark
// ============================================================

const PIN_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['Clear', '0', '⌫'],
];

interface PinPadProps {
  title: string;
  subtitle: string;
  icon?: string;
  onLogin: (pin: string) => Promise<{ success: boolean; error?: string }>;
}

export function PinPad({ title, subtitle, icon = '🍽️', onLogin }: PinPadProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const handleKeyPress = async (key: string) => {
    setError('');

    if (key === 'Clear') { setPin(''); return; }
    if (key === '⌫') { setPin(prev => prev.slice(0, -1)); return; }

    const newPin = pin + key;
    if (newPin.length < 4) { setPin(newPin); return; }

    // Auto-submit at 4 digits
    setPin(newPin);
    setLoggingIn(true);

    const result = await onLogin(newPin);
    if (!result.success) {
      setError(result.error || 'Invalid PIN');
      const display = document.getElementById('pin-display');
      if (display) {
        display.classList.add('animate-shake');
        setTimeout(() => display.classList.remove('animate-shake'), 500);
      }
      setPin('');
    }
    setLoggingIn(false);
  };

  return (
    <div className="app-bg min-h-screen w-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl glass-card shadow-glow mb-4 text-4xl">{icon}</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
          <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
        </div>

        <div className="glass-card px-6 py-4 mb-5 text-center">
          <div id="pin-display" className="flex items-center justify-center space-x-3 min-h-[32px]">
            {pin.length === 0 ? (
              <span className="text-slate-600 text-sm tracking-[0.3em]">••••</span>
            ) : (
              <>
                {pin.split('').map((_, i) => (
                  <div key={i} className="w-3.5 h-3.5 rounded-full bg-brand-500 shadow-glow" />
                ))}
                {Array.from({ length: Math.max(0, 4 - pin.length) }).map((_, i) => (
                  <div key={`empty-${i}`} className="w-3.5 h-3.5 rounded-full border-2 border-white/20" />
                ))}
              </>
            )}
          </div>
          {loggingIn && <p className="text-brand-400 text-xs mt-3 animate-pulse">Verifying…</p>}
        </div>

        {error && (
          <div className="glass-card bg-red-500/10 border-red-500/30 text-red-300 text-sm px-4 py-2.5 mb-4 text-center">{error}</div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {PIN_KEYS.map((row) => (
            row.map((key) => (
              <button
                key={key}
                onClick={() => handleKeyPress(key)}
                disabled={loggingIn}
                className={`
                  ${key === 'Clear' || key === '⌫'
                    ? 'bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-medium border border-white/10'
                    : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white text-2xl font-semibold'}
                  h-16 rounded-2xl backdrop-blur transition-all duration-150
                  active:scale-95 active:bg-white/15
                  disabled:opacity-40 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-brand-500/50
                `}
              >
                {key === '⌫' ? (
                  <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                  </svg>
                ) : key}
              </button>
            ))
          ))}
        </div>
      </div>
    </div>
  );
}
