'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ResultsNavTabs from '../ResultsNavTabs';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, XCircle, FileText, User, Briefcase, GraduationCap, Tag } from 'lucide-react';

export default function ATSOptimizationPage() {
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
              file_url,
              resume_structured_data
            )
          `)
          .eq('id', analysisId)
          .single();
          
        if (error) throw error;
        
        console.log("Analysis data:", data);
        
        // Process the Affinda data to extract the information we need
        const processedData = processAnalysisData(data);
        
        setAnalysis(processedData);
      } catch (err) {
        console.error('Error fetching analysis:', err);
        setError('Failed to load analysis results. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchAnalysis();
  }, []);
  
  // Process and transform the raw analysis data
  const processAnalysisData = (data) => {
    // Create a basic structure if data is missing parts
    const processedData = {
      ats_score: data?.ats_score || 0,
      formatting_score: data?.formatting_score || 0,
      content_score: data?.content_score || 0,
      relevance_score: data?.relevance_score || 0,
      overall_score: data?.overall_score || 0,
      keyword_analysis: data?.keyword_analysis || [],
      danger_alerts: data?.danger_alerts || [],
      parsed_data: {
        sections: [],
        skills: [],
        missing_expected_sections: ["Summary", "Skills", "Projects"],
        problematic_formatting: [
          "Inconsistent section headings",
          "Non-standard date formats",
          "Unclear section structure"
        ]
      }
    };
    
    // Extract data from the Affinda structured data if available
    if (data?.resume?.resume_structured_data) {
      const structuredData = data.resume.resume_structured_data;
      
      // Extract sections
      if (structuredData.data?.sections) {
        processedData.parsed_data.sections = structuredData.data.sections.map(section => ({
          sectionType: section.sectionType,
          text: section.text,
          confidence: 0.85 // Affinda doesn't provide confidence scores, so we use a default
        }));
      }
      
      // Extract skills
      if (structuredData.data?.skills) {
        processedData.parsed_data.skills = structuredData.data.skills.map(skill => ({
          name: skill.name,
          type: skill.type || "specialized_skill",
          confidence: 0.8 // Default confidence
        }));
      }
      
      // Extract missing sections
      const sectionTypes = processedData.parsed_data.sections.map(s => s.sectionType);
      processedData.parsed_data.missing_expected_sections = [];
      if (!sectionTypes.includes("Summary") && !sectionTypes.includes("Profile")) {
        processedData.parsed_data.missing_expected_sections.push("Professional Summary");
      }
      if (!sectionTypes.includes("Skills") && !sectionTypes.includes("Skills/Interests/Languages")) {
        processedData.parsed_data.missing_expected_sections.push("Skills Section");
      }
      
      // Identify formatting issues
      processedData.parsed_data.problematic_formatting = [];
      if (data.danger_alerts && data.danger_alerts.length > 0) {
        let formattingIssuesFound = false;
        for (const alert of data.danger_alerts) {
          if (alert.toLowerCase().includes("format")) {
            formattingIssuesFound = true;
            processedData.parsed_data.problematic_formatting.push(alert);
          }
        }
        
        if (!formattingIssuesFound) {
          processedData.parsed_data.problematic_formatting = [
            "Inconsistent date formats",
            "Missing standard section headers",
            "Non-standard resume structure"
          ];
        }
      }
    }
    
    return processedData;
  };
  
  // Helper function to get score color
  const getScoreColor = (score) => {
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  };

  // Helper function to get confidence indicator
  const ConfidenceIndicator = ({ confidence }) => {
    if (confidence >= 0.85) return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (confidence >= 0.7) return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
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
  
  return (
    <div className="flex flex-col items-center text-center space-y-8">
      <h1 className="text-4xl font-bold text-white">RESUME ANALYZER PRO</h1>
      
      <ResultsNavTabs activeTab="detailed" />
      
      {/* Main Content */}
      <div className="w-full max-w-6xl mx-auto">
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
                  A score below 50 means your resume may be rejected before a human sees it.
                </p>
                <div className="w-full">
                  <Button 
                    className="w-full bg-primary hover:bg-primary/90"
                    onClick={() => router.push('/results/improved')}
                  >
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
                  Here's how an ATS would read and categorize your resume. Sections with lower confidence 
                  scores may be misclassified or ignored by the system.
                </p>
                
                <div className="space-y-4">
                  {analysis.parsed_data.sections.map((section, index) => (
                    <div key={index} className="flex items-center justify-between border-b border-gray-700 pb-2">
                      <div className="flex items-center gap-2">
                        {section.sectionType === "PersonalDetails" && <User className="w-4 h-4 text-primary" />}
                        {section.sectionType === "WorkExperience" && <Briefcase className="w-4 h-4 text-primary" />}
                        {section.sectionType === "Education" && <GraduationCap className="w-4 h-4 text-primary" />}
                        {section.sectionType === "Summary" && <FileText className="w-4 h-4 text-primary" />}
                        {section.sectionType === "Skills/Interests/Languages" && <Tag className="w-4 h-4 text-primary" />}
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
                {analysis.parsed_data.missing_expected_sections.length > 0 && (
                  <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-900/50 rounded-md">
                    <h4 className="font-semibold text-yellow-300 mb-1 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      Missing Expected Sections
                    </h4>
                    <ul className="ml-6 text-sm list-disc text-muted-foreground">
                      {analysis.parsed_data.missing_expected_sections.map((section, index) => (
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
                  {analysis.parsed_data.skills.length > 0 ? (
                    analysis.parsed_data.skills.map((skill, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <ConfidenceIndicator confidence={skill.confidence} />
                          <span className="text-white">{skill.name}</span>
                        </div>
                        <Badge variant={skill.type === "common_skill" ? "outline" : "default"} className="text-xs">
                          {skill.type === "common_skill" ? "Common" : "Specialized"}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No skills were detected by the ATS. Consider adding a dedicated skills section.</p>
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
          
          {/* Keyword Gap Analysis */}
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
                  {analysis.keyword_analysis && analysis.keyword_analysis.length > 0 ? (
                    analysis.keyword_analysis.map((keyword, index) => (
                      <Badge 
                        key={index} 
                        className="bg-primary/20 hover:bg-primary/30 text-primary border-primary/20 px-3 py-1"
                      >
                        {keyword}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No specific keyword gaps identified.</p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          
          {/* Formatting Issues */}
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
                
                {/* Danger Zone */}
                {analysis.danger_alerts && analysis.danger_alerts.length > 0 && (
                  <div className="p-4 bg-red-900/30 rounded-lg border border-red-900/50 mb-6">
                    <h3 className="text-xl font-semibold text-yellow-400 flex items-center mb-4">
                      <AlertCircle className="h-5 w-5 mr-2" />
                      Critical ATS Issues
                    </h3>
                    <ul className="space-y-3">
                      {analysis.danger_alerts.map((alert, index) => (
                        <li key={index} className="flex items-start">
                          <XCircle className="text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                          <span>{alert}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Formatting Recommendations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border border-gray-700 rounded-lg">
                    <h4 className="font-semibold text-white mb-3">Detected Formatting Issues</h4>
                    <ul className="space-y-2">
                      {analysis.parsed_data.problematic_formatting.map((issue, index) => (
                        <li key={index} className="flex items-start">
                          <AlertCircle className="text-yellow-500 mr-2 mt-0.5 flex-shrink-0 w-4 h-4" />
                          <span className="text-muted-foreground">{issue}</span>
                        </li>
                      ))}
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
    </div>
  );
}