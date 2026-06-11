'use client';

import React, { useCallback } from 'react';
import { PinPad } from '../../components/PinPad';
import { useAuth } from '../../AuthProvider';

export default function AdminLoginPage() {
  const { login } = useAuth();

  const handleLogin = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    return login(pin, 'admin');
  }, [login]);

  return <PinPad title="Admin Portal" subtitle="Enter your admin PIN to continue" icon="🔐" onLogin={handleLogin} />;
}