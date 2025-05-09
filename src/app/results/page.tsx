'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ResultsNavTabs from './ResultsNavTabs';
import ResumeSummaryCard from '@/components/ui/ResumeSummaryCard';
import SaveAnalysisButton from '@/components/ui/SaveAnalysisButton';

export default function ResultsPage() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    const fetchAnalysis = async () => {
      const analysisId = localStorage.getItem('currentAnalysisId');
      if (!analysisId) {
        setError('No analysis found. Please upload a resume first.');
        setLoading(false);
        return;
      }
      
      try {
        // Fetch analysis data from Supabase
        const { data, error } = await supabase
          .from('analyses')
          .select(`
            *,
            resume:resume_id(
              job_title,
              job_description,
              file_name,
              file_url
            )
          `)
          .eq('id', analysisId)
          .single();
          
        if (error) throw error;
        
        setAnalysis(data);
      } catch (err) {
        console.error('Error fetching analysis:', err);
        setError('Failed to load analysis results. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchAnalysis();
  }, []);
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-lg text-primary">Loading results...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center text-center space-y-8">
        <h1 className="text-4xl font-bold text-white">RESUME ANALYZER PRO</h1>
        <div className="p-6 bg-red-900/30 rounded-lg max-w-2xl">
          <p className="text-red-200">{error}</p>
          <button 
            className="mt-4 px-6 py-2 bg-primary rounded-lg"
            onClick={() => router.push('/upload')}
          >
            Go Back to Upload
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center text-center space-y-8">
      <h1 className="text-4xl font-bold text-white">RESUME ANALYZER PRO</h1>
      
      <ResultsNavTabs activeTab="overview" />
      
      <div className="w-full max-w-4xl bg-card/30 backdrop-blur-sm rounded-lg overflow-hidden">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-white">Your Resume Analysis</h2>
            <SaveAnalysisButton analysis={analysis} />
          </div>
          
          <div className="flex flex-col md:flex-row gap-8 mb-8">
            {/* Score Circle */}
            <div className="flex flex-col items-center">
              <div className="relative flex items-center justify-center w-48 h-48">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    className="text-gray-700 stroke-current"
                    strokeWidth="8"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                  ></circle>
                  <circle
                    className="text-primary stroke-current"
                    strokeWidth="8"
                    strokeLinecap="round"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - analysis?.overall_score / 100)}`}
                    transform="rotate(-90 50 50)"
                  ></circle>
                </svg>
                <span className="absolute text-5xl font-bold text-white">
                  {analysis?.overall_score}
                </span>
              </div>
              <p className="text-muted-foreground mt-2">Overall Score</p>
            </div>
            
            {/* Replace the original Summary with ResumeSummaryCard */}
            <div className="flex-1">
              <ResumeSummaryCard analysis={analysis} />
            </div>
          </div>
          
          {/* Strengths and Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
            <div className="text-left">
              <h3 className="text-xl font-semibold text-primary mb-4">Key Strengths</h3>
              <ul className="space-y-2">
                {analysis?.strengths?.filter(item => item && item.trim() && !item.match(/^\d+$/))
                  .map((strength, index) => {
                    // Remove any ** markers from the strength text
                    const cleanStrength = strength.replace(/\*\*/g, '');
                    return (
                      <li key={index} className="flex items-start">
                        <span className="text-primary mr-2">✓</span>
                        <span>{cleanStrength}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
            
            <div className="text-left">
              <h3 className="text-xl font-semibold text-white mb-4">Areas for Improvement</h3>
              <ul className="space-y-2">
                {analysis?.improvements?.filter(item => item && item.trim() && !item.match(/^\d+$/))
                  .slice(0, 6) // Limit to first 6 improvement items
                  .map((improvement, index) => {
                    // Remove any ** markers from the improvement text
                    const cleanImprovement = improvement.replace(/\*\*/g, '');
                    return (
                      <li key={index} className="flex items-start">
                        <span className="text-gray-400 mr-2">-</span>
                        <span>{cleanImprovement}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          </div>
          
          {/* Keyword Analysis - Fixed to show actual keywords, not full text */}
          {analysis?.keyword_analysis && analysis.keyword_analysis.length > 0 && (
            <div className="mt-12 text-left">
              <h3 className="text-xl font-semibold text-white mb-4">Missing Keywords</h3>
              <div className="p-4 bg-card/50 rounded-lg">
                <p className="text-muted-foreground mb-3">
                  Adding these keywords from the job description will improve your ATS score:
                </p>
                <div className="flex flex-wrap gap-2">
                  {/* Only use proper keywords, not full strength descriptions */}
                  {analysis.keyword_analysis
                    .filter(item => item && item.trim() && !item.match(/^\d+$/))
                    .map((keyword, index) => (
                    <span 
                      key={index} 
                      className="px-2 py-1 bg-primary/20 text-primary rounded-md text-sm"
                    >
                      {keyword.replace(/\*\*/g, '')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Danger Zone - Always display this section */}
          <div className="mt-12 p-4 bg-red-900/30 rounded-lg text-left">
            <h3 className="text-xl font-semibold text-yellow-400 flex items-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Danger Zone Alerts
            </h3>
            {analysis?.danger_alerts?.filter(item => item && item.trim() && !item.match(/^\d+$/)).length > 0 ? (
              <ul className="space-y-2">
                {analysis.danger_alerts
                  .filter(item => item && item.trim() && !item.match(/^\d+$/))
                  .map((alert, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-red-400 mr-2">✖</span>
                      <span>{alert}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                No critical issues found. Your resume has good overall formatting and structure.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
