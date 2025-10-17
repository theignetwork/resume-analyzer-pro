import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = new Anthropic({
  apiKey: apiKey,
});

export async function POST(request) {
  try {
    const { resumeId } = await request.json();
    console.log("Processing resume ID:", resumeId);
    
    // Fetch resume data from Supabase
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single();
    
    if (resumeError) {
      console.error("Error fetching resume:", resumeError);
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }
    
    console.log("Resume data fetched, file URL:", resume.file_url);
    
    // Call Claude API with the enhanced prompt
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4000,
      messages: [
        { 
          role: "user", 
          content: [
            {
              type: "text",
              text: `You are an expert resume analyzer and career coach with extensive experience in recruitment and hiring. I'm applying for a ${resume.job_title} position and need your professional assessment.

I've attached my resume and provided the job description below. Please analyze my resume thoroughly and provide:

1. OVERALL ASSESSMENT:
   - Overall score (0-100) with brief explanation
   - ATS compatibility score (0-100) - How well will my resume parse in ATS systems?
   - Formatting score (0-100) - How clean, readable, and professional is the layout?
   - Content quality score (0-100) - How compelling and achievement-focused is the content?
   - Relevance score (0-100) - How well does it match the target job?

2. KEY STRENGTHS (3-5 points):
   - Identify specific strengths with examples from my resume
   - Explain why these elements work well

3. AREAS FOR IMPROVEMENT (3-5 points):
   - Identify specific weaknesses with examples from my resume
   - Provide clear rationale for each improvement suggestion

4. CRITICAL ATS ISSUES:
   - Identify any formatting, keyword, or structure problems that would cause ATS rejection
   - Flag any critical missing keywords from the job description

5. IMPROVED CONTENT BY SECTION:
   - For each major section (Summary, Experience, Skills, Education):
     * Show the original content
     * Provide an improved version with better wording, metrics, and keywords
     * Explain the specific improvements made

6. KEYWORD ANALYSIS:
   - List important keywords from the job description missing from my resume
   - Suggest natural ways to incorporate these keywords

Please format your response with clear section headings and use concrete examples from my resume to support your analysis. Make all suggestions specific and actionable.

Job Description: ${resume.job_description || "No job description provided"}`
            },
            {
              type: "file_attachment",
              file_url: resume.file_url
            }
          ]
        }
      ]
    });
    
    console.log("Claude analysis complete");
    
    // Extract the analysis text
    const analysisText = response.content[0].text;
    
    // Simple parsing of the analysis text
    const analysis = {
      overallScore: extractScore(analysisText, "overall score") || 75,
      subscores: {
        ats: extractScore(analysisText, "ATS compatibility score") || 70,
        formatting: extractScore(analysisText, "formatting score") || 75,
        content: extractScore(analysisText, "content quality score") || 75,
        relevance: extractScore(analysisText, "relevance score") || 70
      },
      strengths: extractListItems(analysisText, "KEY STRENGTHS", "AREAS FOR IMPROVEMENT"),
      improvements: extractListItems(analysisText, "AREAS FOR IMPROVEMENT", "CRITICAL ATS ISSUES"),
      dangerAlerts: extractListItems(analysisText, "CRITICAL ATS ISSUES", "IMPROVED CONTENT BY SECTION"),
      improvedSections: {
        summary: extractSection(analysisText, "summary"),
        experience: extractSection(analysisText, "experience"),
        skills: extractSection(analysisText, "skills"),
        education: extractSection(analysisText, "education")
      },
      keywordAnalysis: extractListItems(analysisText, "KEYWORD ANALYSIS", "")
    };
    
    // Save analysis to database
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
      return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      analysisId: savedAnalysis.id,
      analysis: analysis
    });
    
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to analyze resume" 
    }, { status: 500 });
  }
}

// Helper functions to extract information from Claude's response
function extractScore(text, section) {
  const regex = new RegExp(`${section}.*?([0-9]+)`, 'i');
  const match = text.match(regex);
  return match ? parseInt(match[1]) : null;
}

function extractListItems(text, startSection, endSection) {
  const startRegex = new RegExp(`${startSection}[:\\s]*`, 'i');
  const startMatch = text.search(startRegex);
  if (startMatch === -1) return [];
  
  const afterStart = text.substring(startMatch + text.substring(startMatch).match(startRegex)[0].length);
  
  let endMatch = -1;
  if (endSection) {
    const endRegex = new RegExp(`${endSection}`, 'i');
    endMatch = afterStart.search(endRegex);
  }
  
  let relevantText;
  if (endMatch === -1) {
    // If end section not found, take the rest of the text
    relevantText = afterStart;
  } else {
    relevantText = afterStart.substring(0, endMatch);
  }
  
  // Extract bullet points or numbered items
  const items = [];
  const lines = relevantText.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Match bullet points, numbers, or asterisks at the start of lines
    if (trimmed.match(/^(\d+\.|\*|\-)\s+/) || 
        (items.length > 0 && trimmed && !trimmed.match(/^#|^[A-Z].*:$/))) {
      items.push(trimmed.replace(/^(\d+\.|\*|\-)\s+/, ''));
    }
  }
  
  return items.filter(item => item.length > 0).slice(0, 10);
}

function extractSection(text, sectionName) {
  const regex = new RegExp(`(?:original|improved)\\s+${sectionName}[\\s\\S]*?(?=(?:original|improved|\\d\\.\\s|$))`, 'gi');
  const matches = text.match(regex) || [];
  
  let originalText = '';
  let improvedText = '';
  
  for (const match of matches) {
    if (match.toLowerCase().includes('original')) {
      originalText = match.replace(/^.*?original\s+${sectionName}[:\s]*/i, '').trim();
    } else if (match.toLowerCase().includes('improved')) {
      improvedText = match.replace(/^.*?improved\s+${sectionName}[:\s]*/i, '').trim();
    }
  }
  
  return { original: originalText, improved: improvedText };
}