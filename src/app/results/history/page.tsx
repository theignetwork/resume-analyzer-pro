'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ResultsNavTabs from '../ResultsNavTabs';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, ChevronRight, Trash2 } from 'lucide-react';

export default function HistoryPage() {
  const router = useRouter();
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  
  // Load saved analyses from localStorage
  useEffect(() => {
    loadSavedAnalyses();
  }, []);
  
  const loadSavedAnalyses = () => {
    const savedItems = [];
    
    // Loop through localStorage to find all analysis items
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('saved_analysis_')) {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          savedItems.push(item);
        } catch (e) {
          console.error('Error parsing saved analysis:', e);
        }
      }
    }
    
    // Sort by date (newest first)
    savedItems.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    setSavedAnalyses(savedItems);
  };
  
  const viewAnalysis = (analysisId) => {
    // Set as current analysis and navigate to results
    localStorage.setItem('currentAnalysisId', analysisId);
    router.push('/results');
  };
  
  const deleteAnalysis = (analysisId) => {
    localStorage.removeItem(`saved_analysis_${analysisId}`);
    loadSavedAnalyses(); // Refresh the list
  };
  
  return (
    <div className="flex flex-col items-center text-center space-y-8">
      <h1 className="text-4xl font-bold text-white">RESUME ANALYZER PRO</h1>
      
      <ResultsNavTabs activeTab="history" />
      
      <div className="w-full max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-6 text-left">Your Saved Analyses</h2>
        
        {savedAnalyses.length === 0 ? (
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">You haven't saved any analyses yet.</p>
              <Button 
                className="mt-4 bg-primary hover:bg-primary/90"
                onClick={() => router.push('/upload')}
              >
                Upload a Resume
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {savedAnalyses.map((analysis, index) => (
              <Card key={index} className="bg-card/50 backdrop-blur-sm border-primary/20">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="text-left">
                      <h3 className="text-xl font-bold text-white">{analysis.resumeName || 'Unnamed Resume'}</h3>
                      <div className="flex items-center text-muted-foreground text-sm mt-1">
                        <Clock className="w-4 h-4 mr-1" />
                        <span>{new Date(analysis.savedAt).toLocaleString()}</span>
                      </div>
                      <div className="mt-2">
                        <span className="text-primary">Score: {analysis.overallScore}/100</span>
                      </div>
                      {analysis.jobTitle && (
                        <div className="mt-1 text-sm text-muted-foreground">
                          Job Target: {analysis.jobTitle}
                        </div>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => deleteAnalysis(analysis.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="text-primary hover:text-primary/90 hover:bg-primary/10"
                        onClick={() => viewAnalysis(analysis.id)}
                      >
                        View <ChevronRight className="ml-1 w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}