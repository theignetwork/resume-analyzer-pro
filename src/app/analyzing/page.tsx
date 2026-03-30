'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { authenticatedPost, authenticatedFetch } from '@/lib/authenticatedFetch';

export default function AnalyzingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(10);
  const [statusText, setStatusText] = useState("Extracting resume content...");
  const [error, setError] = useState("");

  const processResume = async () => {
    try {
      // Reset state if retrying
      setError("");
      setProgress(10);
      setStatusText("Extracting resume content...");

      // Get resume ID from localStorage
      const resumeId = localStorage.getItem('currentResumeId');
      if (!resumeId) {
        throw new Error("No resume ID found");
      }

      // Step 1: Parse the resume
      console.log("Parsing resume, ID:", resumeId);
      const parseResponse = await authenticatedPost('/api/parse-resume', { resumeId });

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json();
        throw new Error(errorData.error || 'Resume parsing failed');
      }

      // Update progress for step 2
      setProgress(40);
      setStatusText("Starting analysis...");

      // Step 2: Kick off analysis (returns immediately with analysisId)
      console.log("Calling analyze API with resumeId:", resumeId);
      const analyzeResponse = await authenticatedPost('/api/analyze', { resumeId });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json();
        throw new Error(errorData.error || 'Analysis failed to start');
      }

      const data = await analyzeResponse.json();
      console.log("Analysis kicked off:", data);

      const analysisId = data.analysisId;
      localStorage.setItem('currentAnalysisId', analysisId);

      // Step 3: Poll for completion
      setProgress(50);
      setStatusText("Analyzing content quality...");

      const statusMessages = [
        "Analyzing content quality...",
        "Evaluating ATS compatibility...",
        "Checking keyword matches...",
        "Generating improvement suggestions...",
        "Finalizing analysis..."
      ];
      let msgIndex = 0;

      const statusInterval = setInterval(() => {
        msgIndex = Math.min(msgIndex + 1, statusMessages.length - 1);
        setStatusText(statusMessages[msgIndex]);
      }, 4000);

      let attempts = 0;
      const maxAttempts = 60; // 60 * 3s = 3 minutes max

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        attempts++;

        // Gradually increase progress
        setProgress(prev => Math.min(prev + 2, 95));

        try {
          const statusResponse = await authenticatedFetch(`/api/analyze-status?id=${analysisId}`);
          const statusData = await statusResponse.json();

          if (statusData.status === 'complete') {
            clearInterval(statusInterval);
            setProgress(100);
            setStatusText("Analysis complete!");
            setTimeout(() => router.push('/results'), 1000);
            return;
          }

          if (statusData.status === 'error') {
            clearInterval(statusInterval);
            throw new Error(statusData.error || 'Analysis failed');
          }

          // Still processing, continue polling
          console.log(`Poll attempt ${attempts}: still processing...`);
        } catch (pollError) {
          console.warn("Poll error (retrying):", pollError.message);
          // Don't throw on poll errors, just retry
        }
      }

      clearInterval(statusInterval);
      throw new Error("Analysis timed out. Please try again.");

    } catch (error) {
      console.error("Process error:", error);
      setError(`Error processing resume: ${error.message}. Please try again.`);
      setStatusText("Processing failed");
    }
  };

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
        return Math.min(prev + 3, 90);
      });
    }, 500);

    // Start processing after a short delay
    const processingTimeout = setTimeout(() => processResume(), 800);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(processingTimeout);
    };
  }, [router]);

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
            <p>{error}</p>
            <Button
              className="mt-4 bg-primary hover:bg-primary/90"
              onClick={processResume}
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
