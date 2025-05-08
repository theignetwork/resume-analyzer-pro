import React from 'react';
import { Card, CardContent } from "@/components/ui/card";

// Define interface for the props
interface ResumeSummaryCardProps {
  analysis: {
    overall_score?: number;
    ats_score?: number;
    formatting_score?: number;
    content_score?: number;
    relevance_score?: number;
  };
}

// Define interface for score item
interface ScoreItem {
  name: string;
  value: number;
}

const ResumeSummaryCard: React.FC<ResumeSummaryCardProps> = ({ analysis }) => {
  // Extract the scores from the analysis object
  const overallScore = analysis?.overall_score || 0;
  const atsScore = analysis?.ats_score || 0;
  const formattingScore = analysis?.formatting_score || 0;
  const contentScore = analysis?.content_score || 0;
  const relevanceScore = analysis?.relevance_score || 0;
  
  // Generate a dynamic summary based on the scores
  const generateSummary = (): string => {
    // Determine the overall quality assessment
    let qualityAssessment = '';
    
    if (overallScore < 40) {
      qualityAssessment = 'needs significant improvement';
    } else if (overallScore < 70) {
      qualityAssessment = 'has several areas that need improvement';
    } else if (overallScore < 90) {
      qualityAssessment = 'is good but could be optimized';
    } else {
      qualityAssessment = 'is excellent';
    }
    
    // Identify the weakest areas to focus on
    const scores: ScoreItem[] = [
      { name: 'ATS compatibility', value: atsScore },
      { name: 'formatting', value: formattingScore },
      { name: 'content quality', value: contentScore },
      { name: 'relevance', value: relevanceScore }
    ];
    
    // Sort by score (ascending) to find the weakest areas
    scores.sort((a, b) => a.value - b.value);
    
    // Get the 2 lowest scoring areas
    const weakestAreas = scores.slice(0, 2).map(area => area.name);
    
    // Build the complete summary
    return `Your resume ${qualityAssessment} to be competitive. With an overall score of ${overallScore}/100, focus on enhancing ${weakestAreas.join(' and ')} to significantly improve your chances of getting interviews.`;
  };

  return (
    <Card className="bg-card/30 backdrop-blur-sm border-primary/20 mb-6 w-full">
      <CardContent className="p-4">
        <h3 className="text-lg font-semibold text-white mb-2">Analysis Summary</h3>
        <p className="text-muted-foreground">
          {generateSummary()}
        </p>
        
        {/* Display a more concise score breakdown */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
          <div className="col-span-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">Overall Score</span>
              <span className="text-sm font-semibold text-primary">{overallScore}/100</span>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs">ATS Compatibility</span>
              <span className="text-xs">{atsScore}/100</span>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs">Formatting</span>
              <span className="text-xs">{formattingScore}/100</span>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs">Content Quality</span>
              <span className="text-xs">{contentScore}/100</span>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs">Relevance</span>
              <span className="text-xs">{relevanceScore}/100</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Example of how to use it in your results page
const ExampleUsage: React.FC = () => {
  // This would come from your API or state in the real component
  const sampleAnalysis = {
    overall_score: 35,
    ats_score: 30,
    formatting_score: 50,
    content_score: 40,
    relevance_score: 20
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <ResumeSummaryCard analysis={sampleAnalysis} />
    </div>
  );
};

export default ExampleUsage;