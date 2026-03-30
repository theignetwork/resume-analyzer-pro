import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';
import { parseResumeLimit, checkRateLimit } from '@/lib/rateLimit';
import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

const CLAUDE_PARSING_PROMPT = `You are an expert resume parser. I have attached a resume PDF. Your job is to read it and parse the content into a structured format, similar to how an Applicant Tracking System (ATS) would parse it.

Return your response as a single valid JSON object with NO markdown formatting, NO code fences, NO explanation — just the raw JSON object.

The JSON must follow this exact structure:

{
  "personalInfo": {
    "name": "Full Name",
    "email": "email@example.com",
    "phone": "phone number",
    "location": "City, State",
    "linkedin": "linkedin URL or null",
    "website": "website URL or null"
  },
  "summary": "The professional summary or objective text, exactly as written",
  "workExperience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "startDate": "Start date as written",
      "endDate": "End date as written or Present",
      "location": "City, State or Remote",
      "description": "Full text of responsibilities and achievements for this role"
    }
  ],
  "education": [
    {
      "institution": "School Name",
      "degree": "Degree type and field",
      "graduationDate": "Date as written",
      "gpa": "GPA if listed, otherwise null",
      "honors": "Honors if listed, otherwise null"
    }
  ],
  "skills": [
    {
      "name": "Skill Name",
      "confidence": 0.9,
      "level": "Expert/Advanced/Intermediate/Beginner or null"
    }
  ],
  "certifications": [
    {
      "name": "Certification Name",
      "issuer": "Issuing Organization",
      "date": "Date if listed"
    }
  ],
  "languages": [
    {
      "name": "Language",
      "proficiency": "Native/Fluent/Intermediate/Basic"
    }
  ],
  "sections": {
    "summary": { "found": true, "confidence": 0.95 },
    "workExperience": { "found": true, "confidence": 0.90 },
    "education": { "found": true, "confidence": 0.85 },
    "skills": { "found": true, "confidence": 0.80 },
    "certifications": { "found": false, "confidence": 0 },
    "personalInfo": { "found": true, "confidence": 0.95 }
  }
}

Rules:
- Extract ALL information present in the resume
- For skills, assign a confidence score (0.0-1.0) based on how explicitly the skill is stated
- For sections, set "found" to false if the section doesn't exist in the resume
- Confidence scores should reflect how clearly the ATS would identify each section (1.0 = perfectly clear standard heading, 0.5 = implied but not labeled, 0.0 = not found)
- If a field is not present in the resume, use null
- Do NOT hallucinate or invent information that isn't in the resume text
- Parse dates exactly as written in the resume
`;

export async function POST(request) {
  try {
    // Authentication check
    const user = await getUserFromRequest(request);
    if (!user) {
      console.log('[parse-resume] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }
    console.log(`[parse-resume] Authenticated request from user ${user.user_id}`);

    // Rate limit check (5 requests per hour)
    const rateLimitResult = await checkRateLimit(
      parseResumeLimit,
      `user_${user.user_id}`,
      'resume parsing',
      5
    );
    if (!rateLimitResult.success) {
      return rateLimitResult.response;
    }

    const { resumeId } = await request.json();
    if (!resumeId) return NextResponse.json({ error: 'No resumeId provided' }, { status: 400 });

    const { data: resume, error: resumeError } = await supabase.from('resumes').select('*').eq('id', resumeId).single();
    if (resumeError || !resume?.file_url) {
      return NextResponse.json({ error: resumeError?.message || 'Resume has no file_url' }, { status: 404 });
    }

    // Verify user owns this resume
    console.log("[parse-resume] Resume wp_user_id:", resume.wp_user_id, "type:", typeof resume.wp_user_id);
    console.log("[parse-resume] JWT user_id:", user.user_id, "type:", typeof user.user_id);

    if (String(resume.wp_user_id) !== String(user.user_id)) {
      console.error("[parse-resume] MISMATCH - User", user.user_id, "tried to access resume owned by", resume.wp_user_id);
      return NextResponse.json({ error: "Unauthorized - Resume does not belong to you" }, { status: 403 });
    }

    console.log("[parse-resume] Ownership verified for user", user.user_id);

    if (!anthropic) {
      console.error("[parse-resume] No ANTHROPIC_API_KEY configured");
      return NextResponse.json({ error: 'Server configuration error: missing API key' }, { status: 500 });
    }

    // Step 1: Download the PDF from Supabase Storage
    console.log("[parse-resume] Downloading PDF from:", resume.file_url);
    const pdfResponse = await fetch(resume.file_url);
    if (!pdfResponse.ok) {
      console.error("[parse-resume] Failed to download PDF:", pdfResponse.status, pdfResponse.statusText);
      return NextResponse.json({ error: 'Failed to download resume PDF' }, { status: 500 });
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    const pdfBase64 = pdfBuffer.toString('base64');
    console.log("[parse-resume] PDF downloaded, size:", pdfBuffer.length, "bytes");

    // Step 2: Send PDF directly to Claude for parsing (Claude reads PDFs natively)
    console.log("[parse-resume] Sending PDF to Claude for parsing...");
    let claudeResponse;
    try {
      claudeResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64
              }
            },
            {
              type: "text",
              text: CLAUDE_PARSING_PROMPT
            }
          ]
        }]
      });
    } catch (claudeError) {
      console.error("[parse-resume] Claude API error:", claudeError.message);
      return NextResponse.json({ error: 'Resume parsing API error: ' + claudeError.message }, { status: 500 });
    }

    const responseText = claudeResponse.content[0]?.text || '';
    if (!responseText) {
      console.error("[parse-resume] Claude returned empty response");
      return NextResponse.json({ error: 'Resume parsing returned empty response' }, { status: 502 });
    }

    // Step 4: Parse the JSON response from Claude
    let parsedData;
    try {
      // Clean up response in case Claude wrapped it in code fences
      const jsonText = responseText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsedData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("[parse-resume] Failed to parse Claude JSON response:", parseError.message);
      console.error("[parse-resume] Raw response (first 500 chars):", responseText.substring(0, 500));
      return NextResponse.json({ error: 'Failed to parse structured resume data' }, { status: 502 });
    }

    // Step 5: Build confidence scores from the sections field
    const sections = parsedData.sections || {};
    const sectionKeys = ['summary', 'workExperience', 'education', 'skills', 'certifications', 'personalInfo'];
    const sectionScores = sectionKeys.map(k => sections[k]?.confidence || 0).filter(s => s > 0);
    const overallConfidence = sectionScores.length > 0
      ? sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length
      : 0;

    const confidenceScores = {
      overall: overallConfidence,
      sections: {
        summary: sections.summary?.confidence || 0,
        workExperience: sections.workExperience?.confidence || 0,
        education: sections.education?.confidence || 0,
        skills: sections.skills?.confidence || 0,
        certifications: sections.certifications?.confidence || 0,
        personalInfo: sections.personalInfo?.confidence || 0
      }
    };

    console.log("[parse-resume] Confidence scores:", JSON.stringify(confidenceScores));
    console.log("[parse-resume] Skills found:", parsedData.skills?.length || 0);
    console.log("[parse-resume] Work experience entries:", parsedData.workExperience?.length || 0);

    // Build resume_text from parsed data for the analyze route
    const resumeTextParts = [];
    if (parsedData.personalInfo?.name) resumeTextParts.push(parsedData.personalInfo.name);
    if (parsedData.personalInfo?.email) resumeTextParts.push(parsedData.personalInfo.email);
    if (parsedData.personalInfo?.phone) resumeTextParts.push(parsedData.personalInfo.phone);
    if (parsedData.personalInfo?.location) resumeTextParts.push(parsedData.personalInfo.location);
    if (parsedData.summary) resumeTextParts.push('\n' + parsedData.summary);
    if (parsedData.workExperience?.length) {
      resumeTextParts.push('\nWork Experience:');
      for (const job of parsedData.workExperience) {
        resumeTextParts.push(`${job.title || ''} at ${job.company || ''} (${job.startDate || ''} - ${job.endDate || ''})`);
        if (job.description) resumeTextParts.push(job.description);
      }
    }
    if (parsedData.education?.length) {
      resumeTextParts.push('\nEducation:');
      for (const edu of parsedData.education) {
        resumeTextParts.push(`${edu.degree || ''} - ${edu.institution || ''} (${edu.graduationDate || ''})`);
      }
    }
    if (parsedData.skills?.length) {
      resumeTextParts.push('\nSkills: ' + parsedData.skills.map(s => s.name).join(', '));
    }
    if (parsedData.certifications?.length) {
      resumeTextParts.push('\nCertifications: ' + parsedData.certifications.map(c => c.name).join(', '));
    }
    const resumeText = resumeTextParts.join('\n');

    // Step 6: Update the resumes table
    const { error: updateError } = await supabase.from('resumes').update({
      resume_text: resumeText,
      resume_structured_data: parsedData,
      parser_version: 'claude-haiku-4.5'
    }).eq('id', resumeId);

    if (updateError) {
      console.error("[parse-resume] Database update error:", updateError);
      throw updateError;
    }

    console.log("[parse-resume] Resume parsed and saved successfully");

    return NextResponse.json({
      success: true,
      message: 'Resume parsed successfully',
      skillsFound: parsedData.skills?.length || 0,
      confidenceScores
    });
  } catch (error) {
    console.error("[parse-resume] Error:", error);
    return NextResponse.json({ error: 'API error: ' + error.message }, { status: 500 });
  }
}
