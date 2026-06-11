'use client';

import React, { useCallback } from 'react';
import { PinPad } from '../../components/PinPad';
import { useAuth } from '../../AuthProvider';

export default function KitchenLoginPage() {
  const { login } = useAuth();

  const handleLogin = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    return login(pin, 'kitchen_staff');
  }, [login]);

  return <PinPad title="Kitchen Display" subtitle="Enter your kitchen PIN to continue" icon="🍳" onLogin={handleLogin} />;
}