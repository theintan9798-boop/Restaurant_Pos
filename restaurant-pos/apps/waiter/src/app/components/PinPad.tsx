'use client';

import React, { useState } from 'react';

// ============================================================
// Reusable PIN Pad Component — dark themed
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
    <div className="h-screen w-screen flex items-center justify-center bg-gray-950">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
          20%, 40%, 60%, 80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>

      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">{icon}</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
          <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 mb-5 text-center">
          <div id="pin-display" className="flex items-center justify-center space-x-3 min-h-[48px]">
            {pin.length === 0 ? (
              <span className="text-gray-600 text-sm">----</span>
            ) : (
              <>
                {pin.split('').map((_, i) => (
                  <div key={i} className="w-4 h-4 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/40" />
                ))}
                {Array.from({ length: Math.max(0, 4 - pin.length) }).map((_, i) => (
                  <div key={`empty-${i}`} className="w-4 h-4 rounded-full border-2 border-gray-700" />
                ))}
              </>
            )}
          </div>
          {loggingIn && <p className="text-indigo-400 text-xs mt-2 animate-pulse">Verifying...</p>}
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-2.5 mb-4 text-center">{error}</div>
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
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium'
                    : 'bg-gray-800 hover:bg-gray-700 text-white text-2xl font-semibold'}
                  h-16 rounded-xl transition-all duration-150
                  active:scale-95 active:bg-gray-600
                  disabled:opacity-40 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-indigo-500
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