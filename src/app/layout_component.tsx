'use client';

import React from 'react';
import { Toaster } from "@/components/ui/toaster";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#0A0E17] text-foreground font-sans">
      {/* Add potential shared header/footer elements here if needed later */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="text-center text-muted-foreground py-4 mt-8">
        Powered by The IG Network
      </footer>
      <Toaster />
    </div>
  );
};

export default Layout;

