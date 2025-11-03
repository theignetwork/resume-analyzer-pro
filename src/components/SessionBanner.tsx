'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Plus, X } from 'lucide-react';

interface Session {
  id: string;
  session_name: string;
  job_title: string;
  company_name?: string;
  total_uploads: number;
  latest_score: number | null;
  updated_at: string;
}

interface SessionBannerProps {
  sessions: Session[];
  selectedSession: Session | null;
  onSelectSession: (session: Session) => void;
  onNewSession: () => void;
  onClose: () => void;
}

export default function SessionBanner({
  sessions,
  selectedSession,
  onSelectSession,
  onNewSession,
  onClose
}: SessionBannerProps) {
  if (sessions.length === 0) return null;

  return (
    <div className="w-full max-w-2xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-2 border-blue-500/50 rounded-lg p-6 relative animate-fade-in">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-blue-200 hover:text-white transition-colors"
        aria-label="Close"
      >
        <X size={20} />
      </button>

      <div className="flex items-start gap-3 mb-4">
        <div className="mt-0.5">
          <RefreshCw className="text-blue-400" size={24} />
        </div>
        <div className="flex-1 text-left">
          <h3 className="text-white font-bold text-lg mb-1">
            🎯 Continue Previous Analysis?
          </h3>
          <p className="text-blue-100 text-sm">
            You have {sessions.length} active job application{sessions.length !== 1 ? 's' : ''}.
            Select one to upload an improved resume version, or start a new analysis.
          </p>
        </div>
      </div>

      {/* Session List */}
      <div className="space-y-2 mb-4">
        {sessions.map((session) => {
          const isSelected = selectedSession?.id === session.id;
          const versionText = session.total_uploads > 0
            ? `v${session.total_uploads}`
            : 'New';
          const scoreText = session.latest_score
            ? `${session.latest_score}/100`
            : 'Not analyzed';

          return (
            <button
              key={session.id}
              onClick={() => onSelectSession(session)}
              className={`w-full text-left p-3 rounded-lg transition-all ${
                isSelected
                  ? 'bg-blue-500/30 border-2 border-blue-400'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold">
                    {session.session_name || session.job_title}
                  </p>
                  <p className="text-blue-200/70 text-xs mt-0.5">
                    {versionText} • {scoreText} • {new Date(session.updated_at).toLocaleDateString()}
                  </p>
                </div>
                {isSelected && (
                  <div className="text-blue-400 text-sm font-semibold">
                    Selected ✓
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={() => selectedSession && onSelectSession(selectedSession)}
          disabled={!selectedSession}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={16} className="mr-2" />
          Continue with Selected
        </Button>
        <Button
          onClick={onNewSession}
          variant="outline"
          className="flex-1 border-blue-400 text-blue-300 hover:bg-blue-500/10"
        >
          <Plus size={16} className="mr-2" />
          Start Fresh
        </Button>
      </div>
    </div>
  );
}
