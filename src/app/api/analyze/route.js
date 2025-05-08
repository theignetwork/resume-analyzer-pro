import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export async function POST(request) {
  try {
    console.log("API route called - analyze");
    
    // Parse request body
    const body = await request.json();
    console.log("Request body:", body);
    
    const { resumeId } = body;
    if (!resumeId) {
      console.error("No resumeId provided in request");
      return NextResponse.json({ error: 'No resumeId provided' }, { status: 400 });
    }
    
    console.log("Processing resume ID:", resumeId);
    
    // Fetch resume data from Supabase
    try {
      const { data: resume, error: resumeError } = await supabase
        .from('resumes')
        .select('*')
        .eq('id', resumeId)
        .single();
      
      if (resumeError) {
        console.error("Error fetching resume:", resumeError);
        return NextResponse.json({ error: 'Resume not found: ' + resumeError.message }, { status: 404 });
      }
      
      if (!resume) {
        console.error("No resume found with ID:", resumeId);
        return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
      }
      
      console.log("Resume found:", resume.id, resume.file_name);
      console.log("Resume text available:", !!resume.resume_text);
      
      if (!resume.resume_text) {
        console.error("Resume has no extracted text");
        return NextResponse.json({ error: 'Resume has no extracted text' }, { status: 400 });
      }
      
      // Call Claude API with the extracted text
      console.log("Calling Claude API...");
      const response = await anthropic.messages.create({
        model: "claude-3-opus-20240229",
        max_tokens: 4000,
        messages: [
          { 
            role: "user", 
            content: [
              {
                type: "text",
                text: `You are an expert resume analyzer and career coach. I need you to analyze my resume for a ${resume.job_title} position.

Here is the EXACT TEXT from my resume:

${resume.resume_text}

And here is the job description I'm targeting:

${resume.job_description || "No job description provided"}

Please analyze how well my resume matches this job description and provide your feedback in this EXACT format:

1. OVERALL ASSESSMENT:
   - Overall score: [0-100]
   - ATS compatibility score: [0-100]
   - Formatting score: [0-100]
   - Content quality score: [0-100]
   - Relevance score: [0-100]
   
   [Brief explanation of scores]

2. KEY STRENGTHS:
   - [Strength 1]
   - [Strength 2]
   - [Strength 3]

3. AREAS FOR IMPROVEMENT:
   - [Improvement 1]
   - [Improvement 2]
   - [Improvement 3]

4. CRITICAL ATS ISSUES:
   - [ATS issue 1]
   - [ATS issue 2]

5. IMPROVED CONTENT BY SECTION:

Original Profile:
[Copy the exact profile/summary text from my resume provided above]

Improved Profile:
[Your improved version of the profile text]

Original Experience:
[Copy the exact experience section text from my resume provided above]

Improved Experience:
[Your improved version of the experience section]

Original Skills:
[Copy the exact skills section text from my resume provided above]

Improved Skills:
[Your improved version of the skills section]

Original Education:
[Copy the exact education section text from my resume provided above]

Improved Education:
[Your improved version of the education section]

6. KEYWORD ANALYSIS:
   - [Missing keyword 1]
   - [Missing keyword 2]
   - [Missing keyword 3]

IMPORTANT: When extracting the original content, copy and paste EXACTLY from the resume text I provided above. Don't make up content or summarize what you think is there - use the actual text. Use "Original [Section Name]:" and "Improved [Section Name]:" as the exact headings.`
              }
            ]
          }
        ]
      });

      console.log("Claude API response received");
      
      // Extract the analysis text
      const analysisText = response.content[0].text;
      console.log("Analysis text length:", analysisText.length);
      console.log("First 500 characters of response:", analysisText.substring(0, 500));
      
      try {
        // Simple parsing of the analysis text
        const analysis = {
          overallScore: extractScore(analysisText, "overall score|overall assessment") || 75,
          subscores: {
            ats: extractScore(analysisText, "ATS compatibility score|ATS score") || 70,
            formatting: extractScore(analysisText, "formatting score") || 75,
            content: extractScore(analysisText, "content quality score|content score") || 75,
            relevance: extractScore(analysisText, "relevance score") || 70
          },
          strengths: extractListItems(analysisText, "KEY STRENGTHS|STRENGTHS", "AREAS FOR IMPROVEMENT|IMPROVEMENT"),
          improvements: extractListItems(analysisText, "AREAS FOR IMPROVEMENT|IMPROVEMENT", "CRITICAL ATS ISSUES|ATS ISSUES"),
          dangerAlerts: extractListItems(analysisText, "CRITICAL ATS ISSUES|ATS ISSUES", "IMPROVED CONTENT BY SECTION|IMPROVED CONTENT"),
          improvedSections: {
            summary: extractSection(analysisText, "profile|summary"),
            experience: extractSection(analysisText, "experience"),
            skills: extractSection(analysisText, "skills"),
            education: extractSection(analysisText, "education")
          },
          keywordAnalysis: extractListItems(analysisText, "KEYWORD ANALYSIS", "")
        };
        
        console.log("Analysis parsed successfully");
        console.log("Improved sections structure:", JSON.stringify(analysis.improvedSections, null, 2));
        
        // Save analysis to database
        try {
          const { data: savedAnalysis, error: analysisError } = await supabase
            .from('analyses')
            .insert({
              resume_id: resumeId,
              overall_score: analysis.overallScore,
              ats_score: analysis.subscores.ats,
              formatting_score: analysis.subscores.formatting,
              content_score: analysis.subscores.content,
              relevance_score: analysis.subscores.relevance,
              strengths: analysis.strengths,
              improvements: analysis.improvements,
              danger_alerts: analysis.dangerAlerts,
              improved_sections: analysis.improvedSections,
              keyword_analysis: analysis.keywordAnalysis,
              raw_analysis: analysisText
            })
            .select('id')
            .single();
          
          if (analysisError) {
            console.error("Error saving analysis:", analysisError);
            return NextResponse.json({ error: 'Failed to save analysis: ' + analysisError.message }, { status: 500 });
          }
          
          console.log("Analysis saved to database:", savedAnalysis.id);
          
          return NextResponse.json({ 
            analysisId: savedAnalysis.id,
            analysis: analysis
          });
        } catch (dbError) {
          console.error("Database error:", dbError);
          return NextResponse.json({ error: 'Database error: ' + dbError.message }, { status: 500 });
        }
      } catch (parseError) {
        console.error("Error parsing analysis:", parseError);
        return NextResponse.json({ error: 'Error parsing analysis: ' + parseError.message }, { status: 500 });
      }
    } catch (supabaseError) {
      console.error("Supabase error:", supabaseError);
      return NextResponse.json({ error: 'Supabase error: ' + supabaseError.message }, { status: 500 });
    }
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json({ 
      error: 'API error: ' + (error.message || "Unknown error") 
    }, { status: 500 });
  }
}

// Helper functions to extract information from Claude's response
function extractScore(text, sectionPattern) {
  const regex = new RegExp(`(${sectionPattern})\\s*:\\s*([0-9]+)`, 'i');
  const match = text.match(regex);
  return match ? parseInt(match[2]) : null;
}

function extractListItems(text, startSectionPattern, endSectionPattern) {
  try {
    const startRegex = new RegExp(`(${startSectionPattern})[:\\s]*`, 'i');
    const startMatch = text.search(startRegex);
    if (startMatch === -1) return [];
    
    const afterStart = text.substring(startMatch + text.substring(startMatch).match(startRegex)[0].length);
    
    let endMatch = -1;
    if (endSectionPattern && endSectionPattern.length > 0) {
      const endRegex = new RegExp(`(${endSectionPattern})`, 'i');
      endMatch = afterStart.search(endRegex);
    }
    
    let relevantText;
    if (endMatch === -1) {
      // If end section not found, take the next 1000 characters
      relevantText = afterStart.substring(0, 1000);
    } else {
      relevantText = afterStart.substring(0, endMatch);
    }
    
    // Extract bullet points or numbered items
    const items = [];
    const lines = relevantText.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Match bullet points, numbers, or asterisks at the start of lines
      if (trimmed.match(/^(\d+\.|\*|\-)\s+/)) {
        const content = trimmed.replace(/^(\d+\.|\*|\-)\s+/, '').trim();
        if (content.length > 0) {
          items.push(content);
        }
      } 
      // Only include continuation lines if there are already items and the line isn't just a number
      else if (items.length > 0 && trimmed && 
               !trimmed.match(/^#|^[A-Z].*:$/) && 
               !trimmed.match(/^\d+\.?$/)) {
        // Append to previous item if this looks like a continuation
        if (!items[items.length - 1].endsWith('.')) {
          items[items.length - 1] += ' ' + trimmed;
        } else {
          items.push(trimmed);
        }
      }
    }
    
    // Filter out items that are just numbers or empty
    return items
      .filter(item => item.length > 0 && !item.match(/^\d+\.?$/))
      .slice(0, 10);
  } catch (error) {
    console.error("Error extracting list items:", error);
    return [];
  }
}

function extractSection(text, sectionName) {
  try {
    // Log what we're looking for
    console.log(`Extracting ${sectionName} section`);
    
    // Define the patterns with more precision
    const originalPattern = new RegExp(`Original\\s+(${sectionName}):\\s*([\\s\\S]*?)(?=Improved\\s+|Original\\s+|\\d+\\.\\s+|$)`, 'i');
    const improvedPattern = new RegExp(`Improved\\s+(${sectionName}):\\s*([\\s\\S]*?)(?=Original\\s+|Improved\\s+|\\d+\\.\\s+|$)`, 'i');
    
    // Extract the content
    const originalMatch = text.match(originalPattern);
    const improvedMatch = text.match(improvedPattern);
    
    // Get the content or provide a default message
    const originalText = originalMatch && originalMatch[2] ? originalMatch[2].trim() : '';
    const improvedText = improvedMatch && improvedMatch[2] ? improvedMatch[2].trim() : '';
    
    console.log(`${sectionName} extraction results: Original (${originalText.length} chars), Improved (${improvedText.length} chars)`);
    
    return { original: originalText, improved: improvedText };
  } catch (error) {
    console.error(`Error extracting ${sectionName} section:`, error);
    return { original: '', improved: '' };
  }
}