"use client";
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle, AlertCircle, XCircle, FileText, User, Briefcase, 
  GraduationCap, Tag, Copy, Clock, Award, BookOpen 
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ResultsNavTabs from '../ResultsNavTabs';

const ATSOptimizationReport = () => {
  // State for analysis data
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  
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
              file_url,
              parser_version
            )
          `)
          .eq('id', analysisId)
          .single();
          
        if (error) throw error;
        
        console.log("Analysis data for ATS:", data);
        console.log("Structured data:", data?.structured_data);
        console.log("Confidence scores:", data?.confidence_scores);
        
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
  
  // Helper function to get score color
  const getScoreColor = (score) => {
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  };

  // Helper function to get confidence indicator
  const ConfidenceIndicator = ({ confidence }) => {
    if (!confidence && confidence !== 0) return null;
    
    if (confidence >= 0.85) return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (confidence >= 0.7) return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };
  
  // Function to determine section icon
  const getSectionIcon = (sectionType) => {
    switch(sectionType.toLowerCase()) {
      case 'personaldetails':
      case 'contact': 
        return <User className="w-4 h-4 text-primary" />;
      case 'workexperience':
      case 'experience':
      case 'employment':
        return <Briefcase className="w-4 h-4 text-primary" />;
      case 'education':
        return <GraduationCap className="w-4 h-4 text-primary" />;
      case 'summary':
      case 'profile':
      case 'objective':
        return <FileText className="w-4 h-4 text-primary" />;
      case 'skills':
      case 'skills/interests/languages':
        return <Tag className="w-4 h-4 text-primary" />;
      case 'certifications':
      case 'licenses':
        return <Award className="w-4 h-4 text-primary" />;
      case 'projects':
        return <BookOpen className="w-4 h-4 text-primary" />;
      default:
        return <FileText className="w-4 h-4 text-primary" />;
    }
  };
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-lg text-primary">Loading ATS analysis...</p>
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
  
  // Extract the structured data if available
  const structuredData = analysis?.structured_data || {};
  const confidenceScores = analysis?.confidence_scores || {};
  
  // Get skills and sections from structured data
  const skills = structuredData.skills || [];
  const resumeSections = [];
  
  // Build sections array from structured data
  if (structuredData.summary) {
    resumeSections.push({ 
      sectionType: "Summary", 
      text: structuredData.summary, 
      confidence: confidenceScores.sections?.summary || 0 
    });
  }
  
  if (structuredData.workExperience && structuredData.workExperience.length > 0) {
    resumeSections.push({ 
      sectionType: "WorkExperience", 
      text: `${structuredData.workExperience.length} positions found`, 
      confidence: confidenceScores.sections?.workExperience || 0
    });
  }
  
  if (structuredData.education && structuredData.education.length > 0) {
    resumeSections.push({ 
      sectionType: "Education", 
      text: `${structuredData.education.length} entries found`, 
      confidence: confidenceScores.sections?.education || 0
    });
  }
  
  if (structuredData.certifications && structuredData.certifications.length > 0) {
    resumeSections.push({ 
      sectionType: "Certifications", 
      text: `${structuredData.certifications.length} certifications found`, 
      confidence: confidenceScores.sections?.certifications || 0
    });
  }
  
  if (structuredData.personalInfo && Object.keys(structuredData.personalInfo).length > 0) {
    resumeSections.push({ 
      sectionType: "PersonalDetails", 
      text: `Contact information found`, 
      confidence: confidenceScores.sections?.personalInfo || 0.8
    });
  }
  
  // Check for missing expected sections
  const missingExpectedSections = [];
  if (!structuredData.summary) missingExpectedSections.push("Professional Summary");
  if (!structuredData.skills || structuredData.skills.length === 0) missingExpectedSections.push("Skills");
  
  // Identify problematic formatting issues based on confidence scores
  const problematicFormatting = [];
  
  if (confidenceScores.overall < 0.7) {
    problematicFormatting.push("Overall low parsing confidence - resume format may be non-standard");
  }
  
  if (confidenceScores.sections?.workExperience < 0.7) {
    problematicFormatting.push("Work experience section not clearly formatted");
  }
  
  if (confidenceScores.sections?.education < 0.7) {
    problematicFormatting.push("Education section not clearly formatted");
  }
  
  if (confidenceScores.sections?.skills < 0.7) {
    problematicFormatting.push("Skills section not clearly identified or listed");
  }
  
  // If we don't have enough data in structuredData, add generic formatting issues
  if (Object.keys(structuredData).length < 3) {
    problematicFormatting.push(
      "Inconsistent date formats (use MM/YYYY format)",
      "Missing standard section headers",
      "Bullet points without proper formatting"
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      <h1 className="text-4xl font-bold text-white text-center mb-2">RESUME ANALYZER PRO</h1>
      
      {/* Replaced Tabs with ResultsNavTabs */}
      <ResultsNavTabs />
      
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ATS Score Card */}
        <div className="lg:col-span-1">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20 h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-white">ATS Compatibility Score</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              <div className="relative flex items-center justify-center w-40 h-40 mb-4">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    className="text-gray-700 stroke-current"
                    strokeWidth="8"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                  />
                  <circle
                    className="text-primary stroke-current"
                    strokeWidth="8"
                    strokeLinecap="round"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - analysis.ats_score / 100)}`}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <span className={`absolute text-4xl font-bold ${getScoreColor(analysis.ats_score)}`}>
                  {analysis.ats_score}
                </span>
              </div>
              <p className="text-center text-muted-foreground text-sm mb-4">
                This score represents how well your resume will perform in Applicant Tracking Systems.
                {analysis.ats_score < 50 && 
                  " A score below 50 means your resume may be rejected before a human sees it."}
              </p>
              <div className="w-full">
                <Button className="w-full bg-primary hover:bg-primary/90"
                  onClick={() => router.push('/results/improved')}>
                  View Improvement Suggestions
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* ATS Analysis Card */}
        <div className="lg:col-span-2">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-white">ATS Parsing Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                This analysis shows how Applicant Tracking Systems will process your resume. ATS software looks for standard sections, keywords, and proper formatting to determine which resumes reach hiring managers.
              </p>
              
              <div className="space-y-4">
                {resumeSections.map((section, index) => (
                  <div key={index} className="flex items-center justify-between border-b border-gray-700 pb-2">
                    <div className="flex items-center gap-2">
                      {getSectionIcon(section.sectionType)}
                      <span className="text-white">{section.sectionType}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {Math.round(section.confidence * 100)}% Confidence
                      </span>
                      <ConfidenceIndicator confidence={section.confidence} />
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Missing Sections Alert */}
              {missingExpectedSections.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-900/50 rounded-md">
                  <h4 className="font-semibold text-yellow-300 mb-1 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    Missing Expected Sections
                  </h4>
                  <ul className="ml-6 text-sm list-disc text-muted-foreground text-left">
                    {missingExpectedSections.map((section, index) => (
                      <li key={index}>{section}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Detected Skills */}
        <div className="lg:col-span-1">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20 h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-white">Skills Detected by ATS</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                These skills were automatically detected by the ATS from your resume.
              </p>
              <div className="space-y-2">
                {skills.length > 0 ? (
                  skills.map((skill, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <ConfidenceIndicator confidence={skill.confidence} />
                        <span className="text-white">{skill.name}</span>
                      </div>
                      {skill.level && (
                        <Badge variant="outline" className="text-xs">
                          {skill.level}
                        </Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    No skills were automatically detected. Consider adding a clearly labeled skills section.
                  </p>
                )}
              </div>
              
              <div className="mt-6 p-3 bg-primary/10 border border-primary/30 rounded-md">
                <h4 className="font-semibold text-primary mb-1">Expert Tip</h4>
                <p className="text-sm text-muted-foreground">
                  Include skills that exactly match the job description. ATS systems look for these keywords when filtering candidates.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Keyword Gap Analysis - FIXED WITH LENGTH AND ASTERISK FILTERING */}
        <div className="lg:col-span-2">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-white">Keyword Gap Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Your resume is missing these important keywords from the job description. 
                Including them will significantly improve your ATS score.
              </p>
              
              <div className="flex flex-wrap gap-2 mb-6">
                {analysis?.keyword_analysis?.filter(item => item && item.trim()).length > 0 ? (
                  analysis.keyword_analysis
                    .filter(item => item && item.trim())
                    .map((keyword, index) => (
                      <Badge 
                        key={index} 
                        className="bg-primary/20 hover:bg-primary/30 text-primary border-primary/20 px-3 py-1"
                      >
                        {keyword.replace(/\*\*/g, '')}
                      </Badge>
                    ))
                ) : (
                  <p className="text-muted-foreground">No keyword gaps identified.</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-primary/10 border border-primary/30 rounded-md">
                  <h4 className="font-semibold text-primary mb-1">Where to Add Keywords</h4>
                  <ul className="ml-5 text-sm list-disc text-muted-foreground">
                    <li>Professional summary section</li>
                    <li>Skills section (create one if missing)</li>
                    <li>Work experience bullet points</li>
                    <li>Education section (relevant coursework)</li>
                  </ul>
                </div>
                
                <div className="p-3 bg-primary/10 border border-primary/30 rounded-md">
                  <h4 className="font-semibold text-primary mb-1">How to Add Keywords</h4>
                  <ul className="ml-5 text-sm list-disc text-muted-foreground">
                    <li>Use exact matches when possible</li>
                    <li>Incorporate naturally into sentences</li>
                    <li>Include both spelled-out terms and acronyms</li>
                    <li>Use in context of achievements</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Formatting Issues - MODIFIED SECTION */}
        <div className="lg:col-span-3">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-white">Critical ATS Formatting Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                ATS systems rely on proper formatting to correctly parse your resume. The following issues 
                may prevent your resume from being correctly processed.
              </p>
              
              {/* Formatting Recommendations - Two Column Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* UPDATED: Changed heading and added fallback content */}
                <div className="p-4 border border-gray-700 rounded-lg">
                  <h4 className="font-semibold text-white mb-3">Formatting Issues</h4>
                  <ul className="space-y-2">
                    {/* First check if danger_alerts has valid content */}
                    {analysis?.danger_alerts?.filter(item => item && item.trim()).length > 0 ? (
                      analysis.danger_alerts
                        .filter(item => item && item.trim())
                        .map((alert, index) => (
                          <li key={index} className="flex items-start">
                            <XCircle className="text-red-400 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                            <span className="text-muted-foreground">{alert}</span>
                          </li>
                        ))
                    ) : (
                      /* Then check if problematicFormatting has valid content */
                      problematicFormatting.length > 0 ? (
                        problematicFormatting.map((issue, index) => (
                          <li key={index} className="flex items-start">
                            <AlertCircle className="text-yellow-500 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                            <span className="text-muted-foreground">{issue}</span>
                          </li>
                        ))
                      ) : (
                        /* If all else fails, show hardcoded formatting issues as a fallback */
                        <>
                          <li className="flex items-start">
                            <AlertCircle className="text-yellow-500 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                            <span className="text-muted-foreground">Use consistent date formats (MM/YYYY) for better ATS parsing</span>
                          </li>
                          <li className="flex items-start">
                            <AlertCircle className="text-yellow-500 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                            <span className="text-muted-foreground">Ensure all section headers use standard naming conventions</span>
                          </li>
                          <li className="flex items-start">
                            <AlertCircle className="text-yellow-500 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                            <span className="text-muted-foreground">Add a dedicated Skills section with relevant keywords</span>
                          </li>
                        </>
                      )
                    )}
                  </ul>
                </div>
                
                <div className="p-4 border border-gray-700 rounded-lg">
                  <h4 className="font-semibold text-white mb-3">ATS-Friendly Formatting Tips</h4>
                  <ul className="space-y-2">
                    <li className="flex items-start">
                      <CheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                      <span className="text-muted-foreground">Use standard section headings (Experience, Education, Skills)</span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                      <span className="text-muted-foreground">Use consistent date formats (MM/YYYY)</span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                      <span className="text-muted-foreground">Avoid tables, columns, headers, footers, and images</span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                      <span className="text-muted-foreground">Use standard bullet points (•) for lists</span>
                    </li>
                  </ul>
                </div>
              </div>
              
              <div className="flex justify-center mt-6">
                <Button 
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => router.push('/results/improved')}
                >
                  View Improved Content
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ATSOptimizationReport;
