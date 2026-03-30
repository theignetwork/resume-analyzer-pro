const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY
});

exports.handler = async (event) => {
  try {
    const { resumeId, analysisId, wpUserId } = JSON.parse(event.body);
    console.log("[bg-analysis] Starting for resume:", resumeId, "analysis:", analysisId);

    // Fetch resume
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single();

    if (resumeError || !resume) {
      console.error("[bg-analysis] Resume not found:", resumeError?.message);
      await markAnalysisFailed(analysisId, "Resume not found");
      return { statusCode: 200 };
    }

    if (!resume.resume_text) {
      console.error("[bg-analysis] Resume has no extracted text");
      await markAnalysisFailed(analysisId, "Resume has no extracted text");
      return { statusCode: 200 };
    }

    // Build structured data from parsed resume
    const structuredData = buildStructuredData(resume.resume_structured_data);
    const confidenceScores = buildConfidenceScores(resume.resume_structured_data);

    // Build the Claude prompt
    const claudePrompt = buildAnalysisPrompt(resume, structuredData, confidenceScores);

    console.log("[bg-analysis] Calling Claude API...");
    const claudeResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: [{ type: "text", text: claudePrompt }]
      }]
    });

    const analysisText = claudeResponse.content[0]?.text || '';
    if (!analysisText) {
      await markAnalysisFailed(analysisId, "Claude returned empty response");
      return { statusCode: 200 };
    }

    console.log("[bg-analysis] Analysis text length:", analysisText.length);

    // Extract all data from Claude's response
    const extracted = extractAllData(analysisText, structuredData);

    // Update the analysis record
    const { error: updateError } = await supabase
      .from('analyses')
      .update({
        raw_analysis: analysisText,
        overall_score: extracted.overallScore,
        ats_score: extracted.atsScore,
        formatting_score: extracted.formattingScore,
        content_score: extracted.contentScore,
        relevance_score: extracted.relevanceScore,
        strengths: extracted.strengths,
        improvements: extracted.improvements,
        danger_alerts: extracted.dangerAlerts,
        keyword_analysis: extracted.keywordAnalysis,
        improved_sections: extracted.improvedSections,
        structured_data: structuredData,
        confidence_scores: confidenceScores
      })
      .eq('id', analysisId);

    if (updateError) {
      console.error("[bg-analysis] DB update error:", updateError);
      return { statusCode: 200 };
    }

    // Update session scores if applicable
    if (resume.session_id) {
      try {
        const { data: session } = await supabase
          .from('analysis_sessions')
          .select('score_history, best_score')
          .eq('id', resume.session_id)
          .single();

        if (session) {
          const newScoreEntry = {
            version: resume.version_number || 1,
            score: extracted.overallScore,
            ats_score: extracted.atsScore,
            content_score: extracted.contentScore,
            analyzed_at: new Date().toISOString()
          };
          await supabase
            .from('analysis_sessions')
            .update({
              latest_score: extracted.overallScore,
              best_score: Math.max(session.best_score || 0, extracted.overallScore),
              score_history: [...(session.score_history || []), newScoreEntry]
            })
            .eq('id', resume.session_id);
        }
      } catch (e) {
        console.error("[bg-analysis] Session update error:", e);
      }
    }

    console.log("[bg-analysis] Complete for analysis:", analysisId);
    return { statusCode: 200 };

  } catch (error) {
    console.error("[bg-analysis] Error:", error);
    try {
      const { analysisId } = JSON.parse(event.body);
      if (analysisId) await markAnalysisFailed(analysisId, error.message);
    } catch (e) { /* ignore */ }
    return { statusCode: 200 };
  }
};

async function markAnalysisFailed(analysisId, errorMessage) {
  await supabase
    .from('analyses')
    .update({ raw_analysis: `ERROR: ${errorMessage}` })
    .eq('id', analysisId);
}

function buildStructuredData(parsedData) {
  const structuredData = {
    summary: "",
    skills: [],
    workExperience: [],
    education: [],
    certifications: [],
    languages: [],
    personalInfo: {}
  };

  if (!parsedData) return structuredData;

  if (parsedData.personalInfo) {
    structuredData.personalInfo = {
      name: parsedData.personalInfo.name || "",
      phone: parsedData.personalInfo.phone || "",
      email: parsedData.personalInfo.email || "",
      location: parsedData.personalInfo.location || ""
    };
  }
  if (parsedData.summary) structuredData.summary = parsedData.summary;
  if (Array.isArray(parsedData.skills)) {
    structuredData.skills = parsedData.skills.map(s => ({
      name: s.name || "", level: s.level || "", confidence: s.confidence || 0
    }));
  }
  if (Array.isArray(parsedData.workExperience)) {
    structuredData.workExperience = parsedData.workExperience.map(job => ({
      jobTitle: job.title || "", organization: job.company || "",
      location: job.location || "",
      dates: { startDate: job.startDate || "", endDate: job.endDate || "Present" },
      description: job.description || "", responsibilities: "", achievements: "", confidence: 0
    }));
  }
  if (Array.isArray(parsedData.education)) {
    structuredData.education = parsedData.education.map(edu => ({
      institution: edu.institution || "", degree: edu.degree || "", fieldOfStudy: "",
      dates: { startDate: "", endDate: edu.graduationDate || "" },
      description: "", gpa: edu.gpa || "", confidence: 0
    }));
  }
  if (Array.isArray(parsedData.certifications)) {
    structuredData.certifications = parsedData.certifications.map(c => ({
      name: c.name || "", issuer: c.issuer || "", date: c.date || "", confidence: 0
    }));
  }
  if (Array.isArray(parsedData.languages)) {
    structuredData.languages = parsedData.languages.map(l => ({
      name: l.name || "", level: l.proficiency || "", confidence: 0
    }));
  }
  return structuredData;
}

function buildConfidenceScores(parsedData) {
  const confidenceScores = { overall: 0, sections: {} };
  if (!parsedData?.sections) return confidenceScores;

  confidenceScores.sections = {
    summary: parsedData.sections.summary?.confidence || 0,
    workExperience: parsedData.sections.workExperience?.confidence || 0,
    education: parsedData.sections.education?.confidence || 0,
    skills: parsedData.sections.skills?.confidence || 0,
    certifications: parsedData.sections.certifications?.confidence || 0,
    personalInfo: parsedData.sections.personalInfo?.confidence || 0
  };
  const scores = Object.values(confidenceScores.sections).filter(Number);
  if (scores.length) confidenceScores.overall = scores.reduce((a, b) => a + b, 0) / scores.length;
  return confidenceScores;
}

function buildAnalysisPrompt(resume, structuredData, confidenceScores) {
  return `You are an expert resume analyzer and career coach. I need you to analyze my resume for a ${resume.job_title} position.

### RESUME TEXT
${resume.resume_text}

### JOB DESCRIPTION
${resume.job_description || "No job description provided"}

### PARSED SKILLS
${structuredData.skills?.map(s => s.name).join(', ') || 'None detected'}

### ATS CONFIDENCE SCORES
${JSON.stringify(confidenceScores)}

Compare my resume against the JOB DESCRIPTION to assess ATS compatibility, keyword match, content quality, and relevance.

Please provide a comprehensive analysis with these exact sections:

## 1. OVERALL ASSESSMENT
- Overall score: [0-100] (Calculate this as the weighted average of the below scores)
- ATS compatibility score: [0-100]
- Formatting score: [0-100]
- Content quality score: [0-100]
- Relevance score: [0-100]

Provide a brief explanation of these scores.

## 2. KEY STRENGTHS
Identify 3-5 specific strengths of my resume.

## 3. AREAS FOR IMPROVEMENT
Identify 3-5 specific weaknesses or areas for improvement.

## 4. CRITICAL ATS ISSUES
List any formatting, structural, or content issues that could cause ATS rejection.

## 5. KEYWORD ANALYSIS
List important keywords from the job description missing from my resume.
Format as a bullet list with ONE keyword or phrase per line (1-5 words max).

## 6. IMPROVED CONTENT BY SECTION

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
      return result;
    }).join('\n\n')
  : "(No work experience found)"}

### Improved Experience
Rewrite each job with quantified bullet points and action verbs:

### Original Skills
${structuredData.skills?.length > 0 ? structuredData.skills.map(s => s.name || s).join(', ') : "(No skills found)"}

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
Analyze how ATS systems might interpret my resume and suggest formatting changes.

## 8. INDUSTRY-SPECIFIC RECOMMENDATIONS
Provide specific recommendations for the ${resume.job_title} role.

IMPORTANT: Complete all 8 sections.`;
}

function extractAllData(analysisText, structuredData) {
  let overallScore = 75, atsScore = 70, formattingScore = 75, contentScore = 75, relevanceScore = 70;
  let strengths = [], improvements = [], dangerAlerts = [], keywordAnalysis = [];

  // Build originals from structured data
  const buildOriginalSummary = () => structuredData.summary || '';
  const buildOriginalExperience = () => {
    if (!structuredData.workExperience?.length) return '';
    return structuredData.workExperience.map(job => {
      const parts = [];
      if (job.jobTitle) parts.push(job.jobTitle);
      if (job.organization) parts.push(`at ${job.organization}`);
      if (job.dates?.startDate || job.dates?.endDate) parts.push(`(${job.dates.startDate || ''} - ${job.dates.endDate || 'Present'})`);
      if (job.description) parts.push(`\n${job.description}`);
      return parts.join(' ').trim();
    }).join('\n\n');
  };
  const buildOriginalSkills = () => structuredData.skills?.length ? structuredData.skills.map(s => s.name || s).join(', ') : '';
  const buildOriginalEducation = () => {
    if (!structuredData.education?.length) return '';
    return structuredData.education.map(edu => {
      const parts = [];
      if (edu.degree) parts.push(edu.degree);
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
    const es = (pat) => extractScore(analysisText, pat);
    const v = (fn, def) => { const r = fn(); return r !== null ? r : def; };

    overallScore = v(() => es("overall score|overall assessment"), 75);
    atsScore = v(() => es("ATS compatibility score|ATS score"), 70);
    formattingScore = v(() => es("formatting score"), 75);
    contentScore = v(() => es("content quality score|content score"), 75);
    relevanceScore = v(() => es("relevance score"), 70);

    // Calibrate
    if (atsScore < 40 && (formattingScore > 50 || contentScore > 50)) {
      atsScore = Math.max(atsScore, Math.min(formattingScore - 5, 65));
    }
    const calcAvg = Math.round((atsScore + formattingScore + contentScore + relevanceScore) / 4);
    if (Math.abs(overallScore - calcAvg) > 15) {
      overallScore = Math.round(0.6 * overallScore + 0.4 * calcAvg);
    }

    strengths = extractListItems(analysisText, "KEY STRENGTHS|STRENGTHS", "AREAS FOR IMPROVEMENT|IMPROVEMENT") || [];
    improvements = extractListItems(analysisText, "AREAS FOR IMPROVEMENT|IMPROVEMENT", "CRITICAL ATS ISSUES|ATS ISSUES") || [];
    dangerAlerts = extractListItems(analysisText, "CRITICAL ATS ISSUES|ATS ISSUES", "KEYWORD ANALYSIS|KEYWORDS") || [];
    keywordAnalysis = extractKeywords(analysisText, "KEYWORD ANALYSIS", "IMPROVED CONTENT|CONTENT BY SECTION") || [];

    if (!keywordAnalysis.length || keywordAnalysis.some(k => k && k.length > 40)) {
      const raw = extractListItems(analysisText, "KEYWORD ANALYSIS", "IMPROVED CONTENT|CONTENT BY SECTION");
      keywordAnalysis = cleanupKeywords(raw);
    }

    // Extract improved sections
    const patterns = {
      summary: ["summary", "profile", "professional summary"],
      experience: ["experience", "work experience", "employment"],
      skills: ["skills", "qualifications", "expertise"],
      education: ["education", "academic", "degree"]
    };
    for (const [section, alternatives] of Object.entries(patterns)) {
      try {
        const extracted = extractSectionImproved(analysisText, alternatives.join("|"));
        if (extracted?.improved && !isPlaceholderText(extracted.improved)) {
          improvedSections[section].improved = extracted.improved;
        }
        if (extracted?.original && !isPlaceholderText(extracted.original) &&
            extracted.original.length > improvedSections[section].original.length) {
          improvedSections[section].original = extracted.original;
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) {
    console.error("[bg-analysis] Extraction error:", e);
  }

  return { overallScore, atsScore, formattingScore, contentScore, relevanceScore,
    strengths, improvements, dangerAlerts, keywordAnalysis, improvedSections };
}

// --- Extraction helpers (copied from analyze route) ---

function extractScore(text, sectionPattern) {
  try {
    const regex = new RegExp(`(${sectionPattern})\\s*:\\s*([0-9.]+)`, 'i');
    const match = text.match(regex);
    let score = match ? parseFloat(match[2]) : null;
    if (score !== null) {
      score = Math.max(0, Math.min(100, score));
      if (sectionPattern.includes('ATS') && score < 30) score = Math.max(score, 30);
    }
    return score;
  } catch (e) { return null; }
}

function extractListItems(text, startSectionPattern, endSectionPattern) {
  try {
    const startRegex = new RegExp(`(${startSectionPattern})[:\\s]*`, 'i');
    const startMatch = text.search(startRegex);
    if (startMatch === -1) return [];
    const afterStart = text.substring(startMatch + text.substring(startMatch).match(startRegex)[0].length);
    let endMatch = -1;
    if (endSectionPattern) {
      const endRegex = new RegExp(`(${endSectionPattern})`, 'i');
      endMatch = afterStart.search(endRegex);
    }
    const relevantText = endMatch === -1 ? afterStart.substring(0, 1000) : afterStart.substring(0, endMatch);
    const items = [];
    for (const line of relevantText.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.match(/^(\d+\.|\*|\-)\s+/)) {
        const content = trimmed.replace(/^(\d+\.|\*|\-)\s+/, '').trim();
        if (content.length > 0) items.push(content);
      } else if (items.length > 0 && trimmed && !trimmed.match(/^#|^[A-Z].*:$/) && !trimmed.match(/^\d+\.?$/)) {
        if (!items[items.length - 1].endsWith('.')) items[items.length - 1] += ' ' + trimmed;
        else items.push(trimmed);
      }
    }
    return items.filter(i => i.length > 0 && !i.match(/^\d+\.?$/)).slice(0, 10);
  } catch (e) { return []; }
}

function extractKeywords(text, startSectionPattern, endSectionPattern) {
  try {
    const startRegex = new RegExp(`(${startSectionPattern})[:\\s]*`, 'i');
    const startMatch = text.search(startRegex);
    if (startMatch === -1) return [];
    const afterStart = text.substring(startMatch + text.substring(startMatch).match(startRegex)[0].length);
    let endMatch = -1;
    if (endSectionPattern) {
      const endRegex = new RegExp(`(${endSectionPattern})`, 'i');
      endMatch = afterStart.search(endRegex);
    }
    const relevantText = endMatch === -1 ? afterStart.substring(0, 1000) : afterStart.substring(0, endMatch);
    const keywords = [];
    for (const line of relevantText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.match(/^#|^[A-Z].*:$/) || trimmed.match(/^\d+\.?$/)) continue;
      if (trimmed.match(/^(\d+\.|\*|\-)\s+/)) {
        const content = trimmed.replace(/^(\d+\.|\*|\-)\s+/, '').trim().replace(/\*\*/g, '');
        if (content.length > 0 && content.length < 40) keywords.push(content);
      }
    }
    return keywords.filter(i => i && i.trim().length > 0 && i.length < 40 && !i.match(/^\d+$/));
  } catch (e) { return []; }
}

function cleanupKeywords(rawKeywords) {
  if (!Array.isArray(rawKeywords) || !rawKeywords.length) return [];
  const clean = [];
  for (const item of rawKeywords) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const text = item.replace(/\*\*/g, '').trim();
    if (text.length > 0 && text.length < 40 && !text.match(/^\d+$/)) { clean.push(text); continue; }
    if (text.includes(',') || text.includes(';')) {
      for (const part of text.split(/[,;]/)) {
        const c = part.trim();
        if (c.length > 0 && c.length < 40 && !c.match(/^\d+$/)) clean.push(c);
      }
      continue;
    }
    if (text.length >= 40) {
      const words = text.split(' ').slice(0, 3).join(' ');
      if (words.length > 0) clean.push(words);
    }
  }
  return [...new Set(clean)].slice(0, 15);
}

function extractSectionImproved(text, sectionPattern) {
  const patterns = [
    new RegExp(`###\\s*Original\\s+(${sectionPattern})\\s*([\\s\\S]*?)(?=###\\s*Improved|###\\s*Original|##\\s*\\d+|$)`, 'i'),
    new RegExp(`Original\\s+(${sectionPattern})\\s*:([\\s\\S]*?)(?=Improved\\s+|Original\\s+|\\d+\\.\\s+|$)`, 'i'),
    new RegExp(`Original\\s+(${sectionPattern})\\s*([\\s\\S]*?)(?=Improved\\s+|Original\\s+|\\d+\\.\\s+|$)`, 'i'),
  ];
  const improvedPatterns = [
    new RegExp(`###\\s*Improved\\s+(${sectionPattern})\\s*([\\s\\S]*?)(?=###\\s*Original|###\\s*Improved|##\\s*\\d+|$)`, 'i'),
    new RegExp(`Improved\\s+(${sectionPattern})\\s*:([\\s\\S]*?)(?=Original\\s+|Improved\\s+|\\d+\\.\\s+|$)`, 'i'),
    new RegExp(`Improved\\s+(${sectionPattern})\\s*([\\s\\S]*?)(?=Original\\s+|Improved\\s+|\\d+\\.\\s+|$)`, 'i'),
  ];
  let originalText = '', improvedText = '';
  for (const p of patterns) { const m = text.match(p); if (m?.[2]) { originalText = m[2].trim(); break; } }
  for (const p of improvedPatterns) { const m = text.match(p); if (m?.[2]) { improvedText = m[2].trim(); break; } }
  return { original: originalText, improved: improvedText };
}

function isPlaceholderText(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return true;
  const t = text.trim();
  const patterns = [/^\[.*\]$/, /\[See /i, /\[Summarize/i, /\[Copy /i, /\[Insert/i, /\[Add/i,
    /\[Include/i, /\[Provide/i, /\[Write/i, /\[Rewrite/i, /\[List/i, /COPY THE ACTUAL/i,
    /^Write a \d+-\d+ sentence/i, /^Rewrite (each|the|this)/i, /^List skills/i];
  return patterns.some(p => p.test(t));
}
