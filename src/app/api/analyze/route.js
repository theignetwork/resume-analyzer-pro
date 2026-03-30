import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { getUserFromRequest } from '@/lib/auth';
import { analyzeLimit, checkRateLimit } from '@/lib/rateLimit';

export const maxDuration = 60;

// Debug: Check if API key is loaded
console.log("🔑 ANTHROPIC_API_KEY exists:", !!process.env.ANTHROPIC_API_KEY);
console.log("🔑 CLAUDE_API_KEY exists:", !!process.env.CLAUDE_API_KEY);
console.log("🔑 All env keys:", Object.keys(process.env).filter(k => k.includes('API')).join(', '));

const apiKey = process.env.ANTHROPIC_API_KEY;
console.log("🔑 Using API Key exists:", !!apiKey);
console.log("🔑 Using API Key length:", apiKey?.length || 0);
console.log("🔑 Using API Key starts with:", apiKey?.substring(0, 15) || 'undefined');
console.log("🔑 Using API Key ends with:", apiKey?.substring(apiKey.length - 4) || 'undefined');

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

export async function POST(request) {
  try {
    // Authentication check
    const user = await getUserFromRequest(request);
    if (!user) {
      console.log('[analyze] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }
    console.log(`[analyze] Authenticated request from user ${user.user_id}`);

    // Rate limit check (10 requests per hour)
    const rateLimitResult = await checkRateLimit(
      analyzeLimit,
      `user_${user.user_id}`,
      'resume analysis',
      10
    );
    if (!rateLimitResult.success) {
      return rateLimitResult.response;
    }

    if (!anthropic) {
      console.error("❌ No ANTHROPIC_API_KEY found in environment variables");
      return NextResponse.json({ error: 'Server configuration error: missing API key' }, { status: 500 });
    }

    console.log("🔍 API route called - /api/analyze");

    const body = await request.json();
    const { resumeId } = body;

    if (!resumeId) {
      console.error("❌ No resumeId provided");
      return NextResponse.json({ error: 'No resumeId provided' }, { status: 400 });
    }

    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single();

    if (resumeError || !resume) {
      console.error("❌ Resume not found:", resumeError?.message || 'Missing row');
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    // Verify user owns this resume
    if (String(resume.wp_user_id) !== String(user.user_id)) {
      console.log(`[analyze] User ${user.user_id} attempted to access resume owned by ${resume.wp_user_id}`);
      return NextResponse.json({ error: 'Unauthorized - Resume does not belong to you' }, { status: 403 });
    }

    if (!resume.resume_text) {
      console.error("❌ Resume has no extracted text");
      return NextResponse.json({ error: 'Resume has no extracted text' }, { status: 400 });
    }

    // DEBUG: Check what resume_text actually contains
    console.log("=== RESUME TEXT DEBUG ===");
    console.log("Resume text length:", resume.resume_text.length);
    console.log("First 500 characters:", resume.resume_text.substring(0, 500));
    console.log("========================");

    const structuredData = {
      summary: "",
      summary: "",
      skills: [],
      workExperience: [],
      education: [],
      certifications: [],
      languages: [],
      personalInfo: {}
    };

    const confidenceScores = {
      overall: 0,
      sections: {}
    };

    try {
      const parsedData = resume.resume_structured_data;
      if (parsedData) {
        // Claude-parsed format: fields are at the top level (personalInfo, summary, workExperience, etc.)
        if (parsedData.personalInfo) {
          structuredData.personalInfo = {
            name: parsedData.personalInfo.name || "",
            phone: parsedData.personalInfo.phone || "",
            email: parsedData.personalInfo.email || "",
            location: parsedData.personalInfo.location || ""
          };
        }

        if (parsedData.summary) {
          structuredData.summary = parsedData.summary;
        }

        if (Array.isArray(parsedData.skills)) {
          structuredData.skills = parsedData.skills.map(skill => ({
            name: skill.name || "",
            level: skill.level || "",
            confidence: skill.confidence || 0
          }));
        }

        if (Array.isArray(parsedData.workExperience)) {
          structuredData.workExperience = parsedData.workExperience.map(job => ({
            jobTitle: job.title || "",
            organization: job.company || "",
            location: job.location || "",
            dates: {
              startDate: job.startDate || "",
              endDate: job.endDate || "Present"
            },
            description: job.description || "",
            responsibilities: "",
            achievements: "",
            confidence: 0
          }));
        }

        if (Array.isArray(parsedData.education)) {
          structuredData.education = parsedData.education.map(edu => ({
            institution: edu.institution || "",
            degree: edu.degree || "",
            fieldOfStudy: "",
            dates: {
              startDate: "",
              endDate: edu.graduationDate || ""
            },
            description: "",
            gpa: edu.gpa || "",
            confidence: 0
          }));
        }

        if (Array.isArray(parsedData.certifications)) {
          structuredData.certifications = parsedData.certifications.map(cert => ({
            name: cert.name || "",
            issuer: cert.issuer || "",
            date: cert.date || "",
            confidence: 0
          }));
        }

        if (Array.isArray(parsedData.languages)) {
          structuredData.languages = parsedData.languages.map(lang => ({
            name: lang.name || "",
            level: lang.proficiency || "",
            confidence: 0
          }));
        }

        // Use confidence scores from the Claude-parsed sections field
        if (parsedData.sections) {
          confidenceScores.sections = {
            summary: parsedData.sections.summary?.confidence || 0,
            workExperience: parsedData.sections.workExperience?.confidence || 0,
            education: parsedData.sections.education?.confidence || 0,
            skills: parsedData.sections.skills?.confidence || 0,
            certifications: parsedData.sections.certifications?.confidence || 0,
            personalInfo: parsedData.sections.personalInfo?.confidence || 0
          };
        }

        const sectionScores = Object.values(confidenceScores.sections).filter(Number);
        if (sectionScores.length) {
          confidenceScores.overall = sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length;
        }

        console.log("✅ Structured data parsed from resume");
      } else {
        console.warn("⚠️ No structured parser data found");
      }
    } catch (err) {
      console.error("⚠️ Error processing structured data:", err);
    }

    console.log("📡 Calling Claude API...");

    // Define the comprehensive prompt with explicit instructions for ATS analysis
    const claudePrompt = `You are an expert resume analyzer and career coach. I need you to analyze my resume for a ${resume.job_title} position.

### RESUME TEXT
${resume.resume_text}

### JOB DESCRIPTION
${resume.job_description || "No job description provided"}

### PARSED RESUME DATA
This is the structured data parsed from my resume:
${JSON.stringify({ 
  personalInfo: structuredData.personalInfo, 
  summary: structuredData.summary, 
  skills: structuredData.skills, 
  workExperience: structuredData.workExperience, 
  education: structuredData.education, 
  certifications: structuredData.certifications, 
  languages: structuredData.languages, 
  confidenceScores: confidenceScores 
}, null, 2)}

IMPORTANT FORMATTING INSTRUCTIONS:
- Be sure to complete ALL sections in your response

You must directly compare the PARSED RESUME DATA above against the JOB DESCRIPTION to assess:
1. How well an ATS would parse my resume
2. How closely my resume matches the job requirements
3. The quality of the parsed data (confidence scores, extracted skills, etc.)
4. Whether key job requirements are detected

Please provide a comprehensive analysis with these exact sections:

## 1. OVERALL ASSESSMENT
- Overall score: [0-100] (Calculate this as the weighted average of the below scores)
- ATS compatibility score: [0-100] (Based on how well the ATS parsed my resume and confidence scores)
- Formatting score: [0-100] (Based on structural parsing quality)
- Content quality score: [0-100] (Based on effectiveness of content)
- Relevance score: [0-100] (Based on keyword match between structured data and job description)

When calculating these scores:
- For ATS compatibility, look at confidence scores in the structured data
- For relevance, compare the skills and experience in the ATS data to the job requirements
- For content quality, evaluate the clarity and impact of parsed text
- For formatting, assess completeness of section extraction

Provide a brief explanation of these scores that highlights the most critical insights.

## 2. KEY STRENGTHS
Identify 3-5 specific strengths of my resume. Focus on what's working well compared to industry standards and ATS best practices. Be specific and provide examples from my resume.

## 3. AREAS FOR IMPROVEMENT
Identify 3-5 specific weaknesses or areas where my resume could be improved. Prioritize the most impactful changes I should make. Be specific and actionable.

## 4. CRITICAL ATS ISSUES
List any formatting, structural, or content issues that could cause ATS systems to reject my resume. Focus on the most critical problems that need immediate attention.

## 5. KEYWORD ANALYSIS
List important keywords from the job description that are missing from my resume.
Format them as a bullet list with ONE keyword or phrase per line.
IMPORTANT: Keep each keyword or phrase SHORT (1-5 words maximum).
DO NOT include explanations or full sentences, just the specific missing keywords.
Example format:
- project management
- Python
- data analysis
- UX/UI design
- cloud infrastructure

## 6. IMPROVED CONTENT BY SECTION

Below I provide the ORIGINAL content from my resume for each section. For each one, write a REWRITTEN IMPROVED version that is ready to copy-paste directly into my resume.

Requirements for improved versions:
- Add relevant keywords from the job description
- Quantify achievements (add metrics, percentages, dollar amounts, team sizes)
- Use strong action verbs (Led, Developed, Achieved, Increased, etc.)
- Make it ATS-optimized and scannable
- DO NOT write instructions or placeholders - write the ACTUAL improved text

### Original Summary
${structuredData.summary || "(No summary found)"}

### Improved Summary
Write a 2-4 sentence professional summary incorporating keywords from the job description:

### Original Experience
${structuredData.workExperience?.length > 0
  ? structuredData.workExperience.map(job => {
      const parts = [];
      if (job.jobTitle) parts.push(job.jobTitle);
      if (job.organization) parts.push('at ' + job.organization);
      if (job.dates?.startDate || job.dates?.endDate) parts.push('(' + (job.dates.startDate || '') + ' - ' + (job.dates.endDate || 'Present') + ')');
      let result = parts.join(' ');
      if (job.description) result += '\n' + job.description;
      if (job.responsibilities) result += '\n' + job.responsibilities;
      if (job.achievements) result += '\n' + job.achievements;
      return result;
    }).join('\n\n')
  : "(No work experience found)"}

### Improved Experience
Rewrite each job with quantified bullet points and action verbs:

### Original Skills
${structuredData.skills?.length > 0
  ? structuredData.skills.map(s => s.name || s).join(', ')
  : "(No skills found)"}

### Improved Skills
List skills organized by category, adding missing keywords from the job description:

### Original Education
${structuredData.education?.length > 0
  ? structuredData.education.map(edu => {
      const parts = [];
      if (edu.degree) parts.push(edu.degree);
      if (edu.fieldOfStudy) parts.push('in ' + edu.fieldOfStudy);
      if (edu.institution) parts.push('from ' + edu.institution);
      if (edu.dates?.endDate) parts.push('(' + edu.dates.endDate + ')');
      return parts.join(' ');
    }).join('\n')
  : "(No education found)"}

### Improved Education
Rewrite education section (or write "No changes needed" if already well-formatted):

## 7. ATS COMPATIBILITY ANALYSIS
Based on the structured data provided, analyze how different ATS systems might interpret my resume:
- Identify any sections with low confidence scores
- Explain implications of the parsing results
- Suggest specific formatting changes to improve ATS readability

## 8. INDUSTRY-SPECIFIC RECOMMENDATIONS
Provide specific recommendations for the ${resume.job_title} role in terms of:
- Industry-specific keywords
- Expected qualifications
- Current trends in this field
- How my resume compares to industry standards

IMPORTANT: You must complete all 8 sections above - especially the INDUSTRY-SPECIFIC RECOMMENDATIONS section at the end. Make sure to fully address dangerous ATS issues in the CRITICAL ATS ISSUES section.

In your analysis, be specific, actionable, and practical. Explain the "why" behind each recommendation so I understand its importance. Focus on the most impactful changes I can make to improve my chances of getting interviews.`;

    // Add more robust Claude API call with error handling
    let claudeResponse;
    try {
      claudeResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: claudePrompt
          }]
        }]
      });
      
      console.log("Claude API called successfully");
    } catch (claudeError) {
      console.error("❌ Claude API error:", claudeError);
      return NextResponse.json({ 
        error: 'Claude API error: ' + (claudeError.message || 'Unknown error') 
      }, { status: 500 });
    }

    // Validate Claude response
    if (!claudeResponse || !claudeResponse.content || claudeResponse.content.length === 0) {
      console.error("❌ Invalid Claude response structure:", JSON.stringify(claudeResponse).substring(0, 100));
      return NextResponse.json({ error: 'Invalid Claude response structure' }, { status: 502 });
    }

    const analysisText = claudeResponse.content[0]?.text || '';
    console.log("Analysis text length:", analysisText.length);
    
    if (!analysisText || analysisText.length === 0) {
      console.error("❌ Claude returned empty text");
      return NextResponse.json({ error: 'Claude returned empty text' }, { status: 502 });
    }

    // Extract data with error handling
    let overallScore = 75;
    let atsScore = 70;
    let formattingScore = 75;
    let contentScore = 75;
    let relevanceScore = 70;
    let strengths = [];
    let improvements = [];
    let dangerAlerts = [];
    let keywordAnalysis = [];
    // Pre-populate original sections from structured data (don't rely on Claude to copy them)
    const buildOriginalSummary = () => {
      if (structuredData.summary) return structuredData.summary;
      return '';
    };

    const buildOriginalExperience = () => {
      if (!structuredData.workExperience || structuredData.workExperience.length === 0) return '';
      return structuredData.workExperience.map(job => {
        const parts = [];
        if (job.jobTitle) parts.push(job.jobTitle);
        if (job.organization) parts.push(`at ${job.organization}`);
        if (job.dates?.startDate || job.dates?.endDate) {
          parts.push(`(${job.dates.startDate || ''} - ${job.dates.endDate || 'Present'})`);
        }
        if (job.description) parts.push(`\n${job.description}`);
        if (job.responsibilities) parts.push(`\n${job.responsibilities}`);
        if (job.achievements) parts.push(`\n${job.achievements}`);
        return parts.join(' ').trim();
      }).join('\n\n');
    };

    const buildOriginalSkills = () => {
      if (!structuredData.skills || structuredData.skills.length === 0) return '';
      return structuredData.skills.map(skill => skill.name || skill).join(', ');
    };

    const buildOriginalEducation = () => {
      if (!structuredData.education || structuredData.education.length === 0) return '';
      return structuredData.education.map(edu => {
        const parts = [];
        if (edu.degree) parts.push(edu.degree);
        if (edu.fieldOfStudy) parts.push(`in ${edu.fieldOfStudy}`);
        if (edu.institution) parts.push(`from ${edu.institution}`);
        if (edu.dates?.endDate) parts.push(`(${edu.dates.endDate})`);
        return parts.join(' ').trim();
      }).join('\n');
    };

    let improvedSections = {
      summary: { original: buildOriginalSummary(), improved: '' },
      experience: { original: buildOriginalExperience(), improved: '' },
      skills: { original: buildOriginalSkills(), improved: '' },
      education: { original: buildOriginalEducation(), improved: '' }
    };

    try {
      // Try to extract scores
      const extractedOverallScore = extractScore(analysisText, "overall score|overall assessment");
      if (extractedOverallScore !== null) overallScore = extractedOverallScore;
      
      const extractedAtsScore = extractScore(analysisText, "ATS compatibility score|ATS score");
      if (extractedAtsScore !== null) atsScore = extractedAtsScore;
      
      const extractedFormattingScore = extractScore(analysisText, "formatting score");
      if (extractedFormattingScore !== null) formattingScore = extractedFormattingScore;
      
      const extractedContentScore = extractScore(analysisText, "content quality score|content score");
      if (extractedContentScore !== null) contentScore = extractedContentScore;
      
      const extractedRelevanceScore = extractScore(analysisText, "relevance score");
      if (extractedRelevanceScore !== null) relevanceScore = extractedRelevanceScore;
      
      // Apply score calibration to ensure reasonableness
      if (atsScore < 40 && (formattingScore > 50 || contentScore > 50)) {
        console.log("⚠️ ATS score seems too low, applying calibration");
        atsScore = Math.max(atsScore, Math.min(formattingScore - 5, 65));
      }
      
      // Calculate consistency of overall score
      const calculatedAverage = Math.round((atsScore + formattingScore + contentScore + relevanceScore) / 4);
      if (Math.abs(overallScore - calculatedAverage) > 15) {
        console.log("⚠️ Overall score inconsistent with component scores, adjusting");
        overallScore = Math.round(0.6 * overallScore + 0.4 * calculatedAverage);
      }
      
      // Extract lists
      const extractedStrengths = extractListItems(analysisText, "KEY STRENGTHS|STRENGTHS", "AREAS FOR IMPROVEMENT|IMPROVEMENT");
      if (extractedStrengths && extractedStrengths.length > 0) strengths = extractedStrengths;
      
      const extractedImprovements = extractListItems(analysisText, "AREAS FOR IMPROVEMENT|IMPROVEMENT", "CRITICAL ATS ISSUES|ATS ISSUES");
      if (extractedImprovements && extractedImprovements.length > 0) improvements = extractedImprovements;
      
      const extractedDangerAlerts = extractListItems(analysisText, "CRITICAL ATS ISSUES|ATS ISSUES", "KEYWORD ANALYSIS|KEYWORDS");
      if (extractedDangerAlerts && extractedDangerAlerts.length > 0) dangerAlerts = extractedDangerAlerts;
      
      // Use the new extractKeywords function for keyword extraction
      const extractedKeywordAnalysis = extractKeywords(analysisText, "KEYWORD ANALYSIS", "IMPROVED CONTENT|CONTENT BY SECTION");
      if (extractedKeywordAnalysis && extractedKeywordAnalysis.length > 0) keywordAnalysis = extractedKeywordAnalysis;
      
      // Add fallback processing for keywords
      if (!keywordAnalysis || keywordAnalysis.length === 0 || 
          (keywordAnalysis.length > 0 && keywordAnalysis.some(k => k && k.length > 40))) {
        console.log("⚠️ Using fallback keyword processing - keywords may need cleaning");
        const rawKeywords = extractListItems(analysisText, "KEYWORD ANALYSIS", "IMPROVED CONTENT|CONTENT BY SECTION");
        keywordAnalysis = cleanupKeywords(rawKeywords);
      }
      
      // Extract ONLY the improved sections from Claude (we already have originals from structured data)
      const patterns = {
        summary: ["summary", "profile", "professional summary"],
        experience: ["experience", "work experience", "employment"],
        skills: ["skills", "qualifications", "expertise"],
        education: ["education", "academic", "degree"]
      };

      for (const [section, alternatives] of Object.entries(patterns)) {
        const sectionPattern = alternatives.join("|");
        try {
          const extractedSection = extractSectionImproved(analysisText, sectionPattern);
          // Only update improved text from Claude, keep our structured data originals
          if (extractedSection?.improved && !isPlaceholderText(extractedSection.improved)) {
            improvedSections[section].improved = extractedSection.improved;
          }
          // If Claude provided a better original text (not a placeholder), use it
          if (extractedSection?.original &&
              !isPlaceholderText(extractedSection.original) &&
              extractedSection.original.length > improvedSections[section].original.length) {
            improvedSections[section].original = extractedSection.original;
          }
        } catch (err) {
          console.warn(`⚠️ Failed to extract ${section} section:`, err.message);
        }
      }

      console.log("ℹ️ Improved sections with pre-populated originals:", {
        summary: { origLen: improvedSections.summary.original.length, impLen: improvedSections.summary.improved.length },
        experience: { origLen: improvedSections.experience.original.length, impLen: improvedSections.experience.improved.length },
        skills: { origLen: improvedSections.skills.original.length, impLen: improvedSections.skills.improved.length },
        education: { origLen: improvedSections.education.original.length, impLen: improvedSections.education.improved.length }
      });
      
      console.log("✅ Data extraction completed successfully");
    } catch (extractionError) {
      console.error("❌ Extraction error:", extractionError);
      // Continue with default data
    }

    // Get user_id from resume record to associate with analysis
    const resumeUserId = resume.wp_user_id;

    // Insert analysis into database with robust error handling
    try {
      console.log("Saving analysis to database...");
      const insertData = {
        resume_id: resumeId,
        wp_user_id: resumeUserId,
        raw_analysis: analysisText,
        overall_score: overallScore,
        ats_score: atsScore,
        formatting_score: formattingScore,
        content_score: contentScore,
        relevance_score: relevanceScore,
        strengths: strengths,
        improvements: improvements,
        danger_alerts: dangerAlerts,
        keyword_analysis: keywordAnalysis,
        improved_sections: improvedSections,
        // Always include these even if empty
        structured_data: structuredData || {},
        confidence_scores: confidenceScores || {}
      };
      
      console.log("Insert data prepared:", JSON.stringify({
        resumeId,
        dataLength: analysisText.length,
        scores: {
          overall: overallScore,
          ats: atsScore,
          formatting: formattingScore,
          content: contentScore,
          relevance: relevanceScore
        },
        listCounts: {
          strengths: strengths.length,
          improvements: improvements.length,
          dangerAlerts: dangerAlerts.length,
          keywordAnalysis: keywordAnalysis.length
        },
        sectionsAvailable: {
          summary: !!improvedSections.summary.improved,
          experience: !!improvedSections.experience.improved,
          skills: !!improvedSections.skills.improved,
          education: !!improvedSections.education.improved
        }
      }));

      const { data: result, error: insertError } = await supabase
        .from('analyses')
        .insert(insertData)
        .select('id')
        .single();

      if (insertError) {
        console.error("❌ Database insert error:", insertError);
        return NextResponse.json({ error: 'Database error: ' + insertError.message }, { status: 500 });
      }
      
      console.log("✅ Analysis saved successfully with ID:", result.id);

      // Update session with new score if resume is part of a session
      if (resume.session_id) {
        try {
          console.log("Updating session scores for session:", resume.session_id);

          // Fetch current session data
          const { data: session, error: sessionFetchError } = await supabase
            .from('analysis_sessions')
            .select('score_history, best_score')
            .eq('id', resume.session_id)
            .single();

          if (!sessionFetchError && session) {
            // Add new score to history
            const newScoreEntry = {
              version: resume.version_number || 1,
              score: overallScore,
              ats_score: atsScore,
              content_score: contentScore,
              analyzed_at: new Date().toISOString()
            };

            const updatedScoreHistory = [
              ...(session.score_history || []),
              newScoreEntry
            ];

            // Calculate new best score
            const newBestScore = Math.max(
              session.best_score || 0,
              overallScore
            );

            // Update session
            const { error: sessionUpdateError } = await supabase
              .from('analysis_sessions')
              .update({
                latest_score: overallScore,
                best_score: newBestScore,
                score_history: updatedScoreHistory
              })
              .eq('id', resume.session_id);

            if (sessionUpdateError) {
              console.error("⚠️ Error updating session scores:", sessionUpdateError);
            } else {
              console.log("✅ Session scores updated successfully");
            }
          }
        } catch (sessionError) {
          console.error("⚠️ Error in session score update:", sessionError);
          // Don't fail the analysis if session update fails
        }
      }

      return NextResponse.json({
        success: true,
        analysisId: result.id,
        message: 'Analysis completed successfully'
      });
      
    } catch (dbError) {
      console.error("❌ Database operation error:", dbError);
      return NextResponse.json({ error: 'Database error: ' + dbError.message }, { status: 500 });
    }

  } catch (err) {
    console.error("❌ API route error:", err);
    return NextResponse.json({ 
      error: 'API error: ' + (err.message || 'Unknown error') 
    }, { status: 500 });
  }
}

// Helper functions with improved error handling
function extractScore(text, sectionPattern) {
  try {
    const regex = new RegExp(`(${sectionPattern})\\s*:\\s*([0-9.]+)`, 'i');
    const match = text.match(regex);
    let score = match ? parseFloat(match[2]) : null;
    
    // Apply reasonableness checks
    if (score !== null) {
      // Ensure score is within valid range
      score = Math.max(0, Math.min(100, score));
      
      // Apply minimum score for ATS
      if (sectionPattern.includes('ATS') && score < 30) {
        console.log(`ATS score seems too low (${score}), applying minimum threshold`);
        score = Math.max(score, 30);
      }
    }
    
    return score;
  } catch (error) {
    console.error(`Error extracting score for ${sectionPattern}:`, error);
    return null;
  }
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
    // Define the patterns with more precision
    const originalPattern = new RegExp(`Original\\s+(${sectionName})\\s*:([\\s\\S]*?)(?=Improved\\s+|Original\\s+|\\d+\\.\\s+|$)`, 'i');
    const improvedPattern = new RegExp(`Improved\\s+(${sectionName})\\s*:([\\s\\S]*?)(?=Original\\s+|Improved\\s+|\\d+\\.\\s+|$)`, 'i');
    
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

// Enhanced section extraction with multiple pattern attempts
function extractSectionImproved(text, sectionPattern) {
  // Try multiple formats for section headers
  const patterns = [
    // Format: ### Original Summary
    new RegExp(`###\\s*Original\\s+(${sectionPattern})\\s*([\\s\\S]*?)(?=###\\s*Improved|###\\s*Original|##\\s*\\d+|$)`, 'i'),
    // Format: Original Summary:
    new RegExp(`Original\\s+(${sectionPattern})\\s*:([\\s\\S]*?)(?=Improved\\s+${sectionPattern}|Original\\s+|\\d+\\.\\s+|$)`, 'i'),
    // Format without colon: Original Summary
    new RegExp(`Original\\s+(${sectionPattern})\\s*([\\s\\S]*?)(?=Improved\\s+${sectionPattern}|Original\\s+|\\d+\\.\\s+|$)`, 'i'),
    // Fallback pattern
    new RegExp(`Original[\\s\\n]+(${sectionPattern})[\\s\\n]+([\\s\\S]*?)(?=Improved|Original|\\d+\\.\\s+|$)`, 'i')
  ];
  
  const improvedPatterns = [
    // Format: ### Improved Summary
    new RegExp(`###\\s*Improved\\s+(${sectionPattern})\\s*([\\s\\S]*?)(?=###\\s*Original|###\\s*Improved|##\\s*\\d+|$)`, 'i'),
    // Format: Improved Summary:
    new RegExp(`Improved\\s+(${sectionPattern})\\s*:([\\s\\S]*?)(?=Original\\s+|Improved\\s+|\\d+\\.\\s+|$)`, 'i'),
    // Format without colon: Improved Summary
    new RegExp(`Improved\\s+(${sectionPattern})\\s*([\\s\\S]*?)(?=Original\\s+|Improved\\s+|\\d+\\.\\s+|$)`, 'i'),
    // Fallback pattern
    new RegExp(`Improved[\\s\\n]+(${sectionPattern})[\\s\\n]+([\\s\\S]*?)(?=Original|Improved|\\d+\\.\\s+|$)`, 'i')
  ];
  
  let originalText = '';
  let improvedText = '';
  
  // Try all original patterns
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[2]) {
      originalText = match[2].trim();
      console.log(`Found original section with pattern: ${pattern.toString().substring(0, 40)}...`);
      break;
    }
  }
  
  // Try all improved patterns
  for (const pattern of improvedPatterns) {
    const match = text.match(pattern);
    if (match && match[2]) {
      improvedText = match[2].trim();
      console.log(`Found improved section with pattern: ${pattern.toString().substring(0, 40)}...`);
      break;
    }
  }
  
  return { original: originalText, improved: improvedText };
}

// Add specialized keyword extraction function
function extractKeywords(text, startSectionPattern, endSectionPattern) {
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
    
    const relevantText = endMatch === -1 ? afterStart.substring(0, 1000) : afterStart.substring(0, endMatch);
    
    // Extract keywords from bullet points
    const keywords = [];
    const lines = relevantText.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines, section headers, or pure numbers
      if (!trimmed || trimmed.match(/^#|^[A-Z].*:$/) || trimmed.match(/^\d+\.?$/)) {
        continue;
      }
      
      // Check if line is a bullet point or numbered item - these are most likely to be keywords
      if (trimmed.match(/^(\d+\.|\*|\-)\s+/)) {
        // Extract the content after the bullet marker
        const content = trimmed.replace(/^(\d+\.|\*|\-)\s+/, '').trim();
        
        // Remove any markdown formatting and check if it's a reasonable keyword length
        const cleanContent = content.replace(/\*\*/g, '');
        if (cleanContent.length > 0 && cleanContent.length < 40) {
          keywords.push(cleanContent);
        }
      }
    }
    
    // Filter out any items that are just empty strings, numbers, or too long
    return keywords.filter(item => 
      item && item.trim().length > 0 && 
      item.length < 40 && 
      !item.match(/^\d+$/)
    );
  } catch (error) {
    console.error("Error extracting keywords:", error);
    return [];
  }
}

// Add a fallback cleanup function for keywords
function cleanupKeywords(rawKeywords) {
  if (!Array.isArray(rawKeywords) || rawKeywords.length === 0) {
    return [];
  }
  
  const cleanKeywords = [];
  
  for (const item of rawKeywords) {
    if (typeof item !== 'string' || !item.trim()) continue;
    
    // Clean the text
    const text = item.replace(/\*\*/g, '').trim();
    
    // Already short enough? Just use it directly
    if (text.length > 0 && text.length < 40 && !text.match(/^\d+$/)) {
      cleanKeywords.push(text);
      continue;
    }
    
    // Extract quoted or emphasized phrases
    const emphasisMatches = text.match(/"([^"]+)"|'([^']+)'|\*\*([^\*]+)\*\*/g);
    if (emphasisMatches && emphasisMatches.length > 0) {
      for (const match of emphasisMatches) {
        const cleaned = match.replace(/["'*]/g, '').trim();
        if (cleaned.length > 0 && cleaned.length < 40 && !cleaned.match(/^\d+$/)) {
          cleanKeywords.push(cleaned);
        }
      }
      continue;
    }
    
    // Try to extract technical terms or domain keywords
    const technicalTerms = text.match(/\b(Python|Java|JavaScript|React|Node\.js|AWS|Azure|DevOps|UI\/UX|Machine Learning|AI|cloud infrastructure|project management|data analysis|full stack|frontend|backend)\b/gi);
    if (technicalTerms && technicalTerms.length > 0) {
      for (const term of technicalTerms) {
        if (term.length > 0 && term.length < 40 && !cleanKeywords.includes(term)) {
          cleanKeywords.push(term);
        }
      }
      continue;
    }
    
    // Look for commas or semicolons that might separate items
    if (text.includes(',') || text.includes(';')) {
      const parts = text.split(/[,;]/);
      for (const part of parts) {
        const cleaned = part.trim();
        if (cleaned.length > 0 && cleaned.length < 40 && !cleaned.match(/^\d+$/)) {
          cleanKeywords.push(cleaned);
        }
      }
      continue;
    }
    
    // Last resort: Take the first 3 words if the line is too long
    if (text.length >= 40) {
      const words = text.split(' ').slice(0, 3).join(' ');
      if (words.length > 0 && !cleanKeywords.includes(words)) {
        cleanKeywords.push(words);
      }
    }
  }
  
  // Remove duplicates and limit
  return [...new Set(cleanKeywords)].slice(0, 15);
}

// Helper function to detect placeholder text from Claude
function isPlaceholderText(text) {
  if (!text || typeof text !== 'string') return true;

  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  // Common placeholder patterns Claude might return
  const placeholderPatterns = [
    /^\[.*\]$/,                          // Text wrapped in brackets like [See resume...]
    /\[See (the |resume|your)/i,         // [See the...], [See resume...], [See your...]
    /\[Summarize/i,                       // [Summarize key points...]
    /\[Copy (the |your )?/i,             // [Copy the actual text...]
    /\[Insert/i,                          // [Insert actual content...]
    /\[Add/i,                             // [Add your...]
    /\[Include/i,                         // [Include...]
    /\[Provide/i,                         // [Provide...]
    /\[Your (.*) here\]/i,               // [Your summary here]
    /\[Write/i,                          // [Write an improved...]
    /\[Rewrite/i,                        // [Rewrite the...]
    /\[List/i,                           // [List skills...]
    /COPY THE ACTUAL/i,                   // Instructions to copy
    /NOT A PLACEHOLDER/i,                 // Instructions about placeholders
    /from (the |my |your )?resume/i,     // References to "from resume"
    /^Write a \d+-\d+ sentence/i,        // Instruction: Write a 2-4 sentence...
    /^Rewrite (each|the|this)/i,         // Instruction: Rewrite each job...
    /^List skills/i,                      // Instruction: List skills...
    /focusing on highlighting/i,          // Part of instruction text
    /incorporating keywords/i,            // Part of instruction text
  ];

  for (const pattern of placeholderPatterns) {
    if (pattern.test(trimmed)) {
      console.log(`⚠️ Detected placeholder text: "${trimmed.substring(0, 50)}..."`);
      return true;
    }
  }

  return false;
}
