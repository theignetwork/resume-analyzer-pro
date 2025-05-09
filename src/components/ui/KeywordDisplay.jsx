// KeywordDisplay.jsx - Ready-to-use component for the Resume Analyzer Pro application
'use client';

import React from 'react';

const KeywordDisplay = ({ keywords = [], title = "Missing Keywords", description = "Adding these keywords from the job description will improve your ATS score:" }) => {
  // Process keywords to ensure clean display
  const processedKeywords = React.useMemo(() => {
    if (!Array.isArray(keywords)) return [];
    
    return keywords
      // Filter out null, undefined, and empty strings
      .filter(keyword => keyword && typeof keyword === 'string' && keyword.trim().length > 0)
      // Clean up formatting and set reasonable length limits
      .map(keyword => {
        const cleaned = keyword.replace(/\*\*/g, '').trim(); // Remove markdown formatting
        // If keyword is too long, it's probably not a keyword but a paragraph
        if (cleaned.length > 40) {
          // Try to extract a shorter phrase
          const firstSentence = cleaned.split('.')[0].trim();
          if (firstSentence.length < 40) return firstSentence;
          
          // Or just take the first few words
          return cleaned.split(' ').slice(0, 4).join(' ');
        }
        return cleaned;
      })
      // Final filtering for reasonable keywords
      .filter(keyword => 
        keyword.length > 0 && 
        keyword.length < 40 && 
        !keyword.match(/^\d+$/) && // Not just a number
        !keyword.match(/^[\.,-\/#!$%\^&\*;:{}=\-_`~()]+$/) // Not just punctuation
      )
      // Unique keywords only
      .filter((keyword, index, self) => self.indexOf(keyword) === index)
      // Limit to a reasonable number
      .slice(0, 15);
  }, [keywords]);
  
  // If no keywords after processing, show a nice message
  if (processedKeywords.length === 0) {
    return (
      <div className="mt-6 text-left">
        <h3 className="text-xl font-semibold text-white mb-4">{title}</h3>
        <div className="p-4 bg-card/50 rounded-lg">
          <p className="text-muted-foreground">
            Your resume already contains most essential keywords for this position.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="mt-6 text-left">
      <h3 className="text-xl font-semibold text-white mb-4">{title}</h3>
      <div className="p-4 bg-card/50 rounded-lg">
        <p className="text-muted-foreground mb-3">
          {description}
        </p>
        <div className="flex flex-wrap gap-2">
          {processedKeywords.map((keyword, index) => (
            <span 
              key={index} 
              className="px-2 py-1 bg-primary/20 text-primary rounded-md text-sm"
            >
              {keyword}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default KeywordDisplay;
