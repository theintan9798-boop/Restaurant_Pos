import React from 'react';
import './globals.css';
import { AuthProvider } from './AuthProvider';
import { SocketProvider } from './SocketProvider';

export const metadata = {
  title: 'Restaurant POS — Waiter',
  description: 'Restaurant Point of Sale — Waiter Tablet App',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased app-bg h-screen overflow-hidden">
        <AuthProvider>
          <SocketProvider>
            {children}
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}