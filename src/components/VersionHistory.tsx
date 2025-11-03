'use client';
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScoreEntry {
  version: number;
  score: number;
  ats_score?: number;
  content_score?: number;
  analyzed_at: string;
}

interface VersionHistoryProps {
  scoreHistory: ScoreEntry[];
  currentVersion: number;
}

export default function VersionHistory({ scoreHistory, currentVersion }: VersionHistoryProps) {
  if (!scoreHistory || scoreHistory.length === 0) {
    return null;
  }

  // Sort by version descending (newest first)
  const sortedHistory = [...scoreHistory].sort((a, b) => b.version - a.version);

  const getScoreDelta = (currentScore: number, previousScore: number | null) => {
    if (previousScore === null) return null;
    return currentScore - previousScore;
  };

  const getDeltaColor = (delta: number | null) => {
    if (delta === null) return '';
    if (delta > 0) return 'text-green-400';
    if (delta < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getDeltaIcon = (delta: number | null) => {
    if (delta === null) return null;
    if (delta > 0) return <TrendingUp className="w-4 h-4" />;
    if (delta < 0) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  return (
    <div className="w-full bg-card/30 backdrop-blur-sm rounded-lg p-6 border border-border">
      <h3 className="text-xl font-semibold text-white mb-4">Version History</h3>
      <p className="text-muted-foreground text-sm mb-6">
        Track your resume improvements across {scoreHistory.length} version{scoreHistory.length !== 1 ? 's' : ''}
      </p>

      <div className="space-y-3">
        {sortedHistory.map((entry, index) => {
          const previousEntry = sortedHistory[index + 1];
          const delta = getScoreDelta(entry.score, previousEntry?.score || null);
          const isCurrent = entry.version === currentVersion;

          return (
            <div
              key={entry.version}
              className={`flex items-center justify-between p-4 rounded-lg transition-all ${
                isCurrent
                  ? 'bg-primary/20 border-2 border-primary'
                  : 'bg-white/5 border border-white/10'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <span className={`text-sm font-bold ${isCurrent ? 'text-primary' : 'text-white'}`}>
                    v{entry.version}
                  </span>
                  {isCurrent && (
                    <span className="text-xs text-primary font-medium mt-1">Current</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-3xl font-bold ${isCurrent ? 'text-primary' : 'text-white'}`}>
                    {entry.score}
                  </span>
                  <span className="text-muted-foreground text-sm">/100</span>

                  {delta !== null && (
                    <div className={`flex items-center gap-1 ml-2 ${getDeltaColor(delta)}`}>
                      {getDeltaIcon(delta)}
                      <span className="text-sm font-semibold">
                        {delta > 0 ? '+' : ''}{delta}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right">
                <p className="text-muted-foreground text-xs">
                  {new Date(entry.analyzed_at).toLocaleDateString()}
                </p>
                <p className="text-muted-foreground text-xs">
                  {new Date(entry.analyzed_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      {scoreHistory.length > 1 && (
        <div className="mt-6 pt-6 border-t border-border">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-muted-foreground text-xs mb-1">First Score</p>
              <p className="text-white font-bold text-lg">
                {sortedHistory[sortedHistory.length - 1].score}
              </p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-xs mb-1">Latest Score</p>
              <p className="text-primary font-bold text-lg">
                {sortedHistory[0].score}
              </p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground text-xs mb-1">Improvement</p>
              <p className={`font-bold text-lg ${
                sortedHistory[0].score - sortedHistory[sortedHistory.length - 1].score > 0
                  ? 'text-green-400'
                  : 'text-gray-400'
              }`}>
                +{sortedHistory[0].score - sortedHistory[sortedHistory.length - 1].score}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
