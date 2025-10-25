// Phase 8: PDF Report Preview Component
"use client";

import React from 'react';
import ResultsNavTabs from '../ResultsNavTabs'; // Adjust path as needed
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Mail, CheckSquare } from 'lucide-react'; // Icons
import { useToast } from "@/hooks/use-toast";

// Placeholder for the report preview content
const ReportPreviewContent = () => {
  const overallScore = 76; // Match mockup
  return (
    <div className="bg-white text-black p-8 rounded-lg shadow-lg max-w-2xl mx-auto font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 border-b pb-4 border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">RESUME ANALYSIS REPORT</h2>
          <p className="text-sm text-gray-500">John Doe - April 23, 2024</p> {/* Placeholder */}
        </div>
        <span className="text-xs text-gray-400">Powered by The IG Network</span>
      </div>

      {/* Score and Subscores */}
      <div className="grid grid-cols-3 gap-8 mb-8 items-center">
        {/* Overall Score */}
        <div className="col-span-1 flex flex-col items-center justify-center">
           {/* Basic Circular Score - Match mockup */}
           <div className="relative flex justify-center items-center w-32 h-32">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle className="text-gray-200" strokeWidth="8" stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" />
                <circle className="text-teal-500" strokeWidth="8" strokeDasharray={`${overallScore * 2.64}, 264`} strokeLinecap="round" stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" transform="rotate(-90 50 50)" />
              </svg>
              <span className="absolute text-3xl font-bold text-teal-600">{overallScore}</span>
            </div>
        </div>
        {/* Subscores */}
        <div className="col-span-2 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Overall Score</span>
            <div className="w-1/2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500" style={{ width: `${overallScore}%` }}></div>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">ATS</span>
            <div className="w-1/2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500" style={{ width: `85%` }}></div> {/* Placeholder */}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Formatting</span>
            <div className="w-1/2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500" style={{ width: `90%` }}></div> {/* Placeholder */}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Content</span>
            <div className="w-1/2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500" style={{ width: `65%` }}></div> {/* Placeholder */}
            </div>
          </div>
           <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Relevance</span>
            <div className="w-1/2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500" style={{ width: `70%` }}></div> {/* Placeholder */}
            </div>
          </div>
        </div>
      </div>

      {/* Summary of Findings */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Summary of Findings</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-600 text-sm">
          <li>Strong alignment with job description</li>
          <li>Effective use of keywords</li>
          <li>Formatting is clean and professional</li>
        </ul>
      </div>

      {/* Improvement Checklist */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-3">Improvement Checklist</h3>
        <div className="space-y-2 text-gray-600 text-sm">
          <div className="flex items-center space-x-2">
            <CheckSquare className="w-4 h-4 text-teal-500 flex-shrink-0" />
            <span>Enhance the professional summary</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckSquare className="w-4 h-4 text-teal-500 flex-shrink-0" />
            <span>Refine bullet points in work experience</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckSquare className="w-4 h-4 text-teal-500 flex-shrink-0" />
            <span>Include additional relevant skills</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ReportPreviewPage = () => {
  const { toast } = useToast();

  // Function to handle download (placeholder)
  const handleDownload = () => {
    console.log("Download report clicked");
    // In a real app, trigger PDF generation/download
    toast({
      title: "Feature Coming Soon",
      description: "PDF report download will be available soon!",
    });
  };

  return (
    <div className="w-full space-y-8">
      <ResultsNavTabs />

      <div className="flex justify-end space-x-4 mb-6">
         {/* Email button - Lower priority styling */}
         <Button variant="outline" className="border-primary/50 text-primary/80 hover:bg-primary/10 hover:text-primary">
            <Mail className="w-4 h-4 mr-2" /> Email Report
         </Button>
         {/* Download button - Primary CTA */}
         <Button
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-3 rounded-lg shadow-lg shadow-primary/30 hover:shadow-primary/40 transition-all duration-300"
            onClick={handleDownload}
          >
            <Download className="w-5 h-5 mr-2" /> Download Report
          </Button>
      </div>

      {/* Report Preview Area */}
      <Card className="bg-card/80 backdrop-blur-sm border border-border p-6">
        <CardContent className="p-0">
          <ReportPreviewContent />
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportPreviewPage;

