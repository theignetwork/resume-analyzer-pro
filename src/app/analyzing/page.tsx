'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Progress } from "@/components/ui/progress";

export default function AnalyzingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(10);
  const [statusText, setStatusText] = useState("Parsing resume...");
  const [error, setError] = useState("");
  
  useEffect(() => {
    // Get resume ID from localStorage
    const resumeId = localStorage.getItem('currentResumeId');
    if (!resumeId) {
      console.error("No resume ID found in localStorage");
      router.push('/upload');
      return;
    }
    
    // Animate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) clearInterval(progressInterval);
        return Math.min(prev + 3, 90); // Slower increment
      });
    }, 500);
    
    // Process the resume in two steps
    const processResume = async () => {
      try {
        // Step 1: Parse the resume with Affinda
        console.log("Parsing resume with Affinda, ID:", resumeId);
        const parseResponse = await fetch('/api/parse-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeId })
        });
        
        if (!parseResponse.ok) {
          const errorData = await parseResponse.json();
          throw new Error(errorData.error || 'Resume parsing failed');
        }
        
        // Update progress and status for step 2
        setProgress(50);
        setStatusText("Analyzing content quality...");
        setTimeout(() => setStatusText("Evaluating ATS compatibility..."), 2000);
        setTimeout(() => setStatusText("Generating improvement suggestions..."), 5000);
        
        // Step 2: Analyze the parsed resume
        console.log("Calling analyze API with resumeId:", resumeId);
        const analyzeResponse = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeId })
        });
        
        if (!analyzeResponse.ok) {
          const errorData = await analyzeResponse.json();
          throw new Error(errorData.error || 'Analysis failed');
        }
        
        const data = await analyzeResponse.json();
        console.log("Analysis complete:", data);
        
        // Store analysis results
        localStorage.setItem('currentAnalysisId', data.analysisId);
        
        // Complete progress and navigate to results
        setProgress(100);
        setTimeout(() => router.push('/results'), 1000);
        
      } catch (error) {
        console.error("Process error:", error);
        setError(`Error processing resume: ${error.message}. Please try again.`);
        setStatusText("Processing failed");
      }
    };
    
    // Start processing after a short delay
    setTimeout(() => processResume(), 800);
    
    return () => clearInterval(progressInterval);
  }, [router]);
  
  // Return the UI (unchanged from your original code)
  return (
    <div className="flex flex-col items-center text-center space-y-8">
      <h1 className="text-4xl font-bold text-white">RESUME ANALYZER PRO</h1>
      <p className="text-lg text-primary">Step 2 of 3 - Analyzing</p>
      
      <div className="w-full max-w-2xl mt-12">
        <p className="text-xl text-teal-400 mb-6">Analyzing Your Resume...</p>
        
        <Progress value={progress} className="h-2 w-full bg-gray-700">
          <div
            className="h-full bg-teal-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </Progress>
        
        <p className="text-muted-foreground mt-4">{statusText}</p>
        
        {error && (
          <div className="mt-8 p-4 bg-red-900/50 text-red-200 rounded-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}