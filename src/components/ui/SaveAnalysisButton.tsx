// components/ui/SaveAnalysisButton.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Save, Check } from 'lucide-react';

export default function SaveAnalysisButton({ analysis }) {
  const [isSaved, setIsSaved] = useState(false);
  
  // Check if analysis is already saved
  useEffect(() => {
    if (!analysis?.id) return;
    
    const savedKey = `saved_analysis_${analysis.id}`;
    const isSavedInStorage = localStorage.getItem(savedKey) !== null;
    setIsSaved(isSavedInStorage);
  }, [analysis]);
  
  const handleSave = () => {
    if (!analysis) return;
    
    const savedKey = `saved_analysis_${analysis.id}`;
    
    // If already saved, don't save again
    if (isSaved) return;
    
    // Prepare data to save
    const saveData = {
      id: analysis.id,
      resumeName: analysis.resume?.file_name || 'Resume',
      savedAt: new Date().toISOString(),
      overallScore: analysis.overall_score,
      jobTitle: analysis.resume?.job_title,
      // Add any other data you want to retain
    };
    
    // Save to localStorage
    localStorage.setItem(savedKey, JSON.stringify(saveData));
    setIsSaved(true);
    
    // Optional: Show a success message (you could add toast notifications)
  };
  
  return (
    <Button
      onClick={handleSave}
      disabled={isSaved}
      variant={isSaved ? "outline" : "default"}
      className={isSaved ? "bg-green-900/20 text-green-500 border-green-500/30" : "bg-primary hover:bg-primary/90"}
    >
      {isSaved ? (
        <>
          <Check className="w-4 h-4 mr-2" /> Saved
        </>
      ) : (
        <>
          <Save className="w-4 h-4 mr-2" /> Save Analysis
        </>
      )}
    </Button>
  );
}