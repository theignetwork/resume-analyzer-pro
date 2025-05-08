"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ResultsNavTabs from '../ResultsNavTabs';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Zap, Edit3, Award } from 'lucide-react';

// Reusable component for Before/After section
interface ComparisonSectionProps {
  title: string;
  originalText: string;
  improvedText: string;
  improvements?: { icon: React.ElementType; label: string }[];
}

const ComparisonSection: React.FC<ComparisonSectionProps> = ({ title, originalText, improvedText, improvements }) => {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(err => console.error('Failed to copy:', err));
    alert('Copied to clipboard!');
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border border-border">
      <CardHeader>
        <CardTitle className="text-white text-2xl">{title}</CardTitle>
        <p className="text-sm text-muted-foreground pt-1">
          We rewrote this section to improve keyword alignment and boost clarity. Copy it over with one click.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Original Card */}
        <Card className="bg-input/30 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-muted-foreground">Original</CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <p className="text-sm text-muted-foreground/80 whitespace-pre-line">
              {originalText}
            </p>
          </CardContent>
        </Card>

        {/* Improved Card */}
        <Card className="bg-primary/10 border-primary/50">
          <CardHeader className="pb-2 flex flex-row justify-between items-start">
            <CardTitle className="text-lg text-primary">Improved</CardTitle>
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded font-semibold">IMPROVED</span>
          </CardHeader>
          <CardContent className="relative space-y-3">
            <p className="text-sm text-white whitespace-pre-line">
              {improvedText}
            </p>
            <div className="flex space-x-3 items-center pt-2 border-t border-primary/20">
              {improvements?.map((imp, index) => {
                const Icon = imp.icon;
                return (
                  <span key={index} className="flex items-center text-xs text-primary/80">
                    <Icon className="w-3.5 h-3.5 mr-1" /> {imp.label}
                  </span>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="absolute bottom-3 right-3 border-primary text-primary hover:bg-primary/10 hover:text-primary h-8 px-3"
                onClick={() => handleCopy(improvedText)}
              >
                <Copy className="w-4 h-4 mr-1" /> Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
};

const ImprovedContentPage = () => {
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
        
        console.log("Analysis data for improved content:", data);
        console.log("Improved sections:", data?.improved_sections);
        
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

  // Get improved sections from analysis
  const improvedSections = analysis?.improved_sections || {};
  
  // Define improvement icons for each section
  const sectionImprovements = {
    summary: [
      { icon: Zap, label: 'ATS Optimized' },
      { icon: Edit3, label: 'Clarity' }
    ],
    experience: [
      { icon: Award, label: 'Quantified Achievement' },
      { icon: Edit3, label: 'Clarity Boost' }
    ],
    skills: [
      { icon: Zap, label: 'Keyword Alignment' }
    ],
    education: [
      { icon: Edit3, label: 'Clarity' },
      { icon: Zap, label: 'ATS Optimized' }
    ]
  };
  
  return (
    <div className="w-full space-y-8">
      <h1 className="text-4xl font-bold text-white text-center">RESUME ANALYZER PRO</h1>
      
      <ResultsNavTabs activeTab="improved" />
      
      <div className="w-full max-w-4xl mx-auto space-y-8">
        {/* Only show sections that exist in the data */}
        {improvedSections.summary && (
          <ComparisonSection
            title="Summary"
            originalText={improvedSections.summary.original || "No original content"}
            improvedText={improvedSections.summary.improved || "No improved content"}
            improvements={sectionImprovements.summary}
          />
        )}
        
        {improvedSections.experience && (
          <ComparisonSection
            title="Experience"
            originalText={improvedSections.experience.original || "No original content"}
            improvedText={improvedSections.experience.improved || "No improved content"}
            improvements={sectionImprovements.experience}
          />
        )}
        
        {improvedSections.skills && (
          <ComparisonSection
            title="Skills"
            originalText={improvedSections.skills.original || "No original content"}
            improvedText={improvedSections.skills.improved || "No improved content"}
            improvements={sectionImprovements.skills}
          />
        )}
        
        {improvedSections.education && (
          <ComparisonSection
            title="Education"
            originalText={improvedSections.education.original || "No original content"}
            improvedText={improvedSections.education.improved || "No improved content"}
            improvements={sectionImprovements.education}
          />
        )}
      </div>
    </div>
  );
};

export default ImprovedContentPage;