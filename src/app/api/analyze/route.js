import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export async function POST(request) {
  try {
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

    if (!resume.resume_text) {
      console.error("❌ Resume has no extracted text");
      return NextResponse.json({ error: 'Resume has no extracted text' }, { status: 400 });
    }

    const structuredData = {
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
      if (parsedData?.data) {
        const data = parsedData.data;

        if (data.name) structuredData.personalInfo.name = data.name.raw;
        if (data.phoneNumbers?.length) structuredData.personalInfo.phone = data.phoneNumbers[0].raw;
        if (data.emails?.length) structuredData.personalInfo.email = data.emails[0].raw;
        if (data.location) structuredData.personalInfo.location = data.location.raw;

        if (data.summary?.raw) {
          structuredData.summary = data.summary.raw;
          confidenceScores.sections.summary = data.summary.confidence || 0;
        }

        if (Array.isArray(data.skills)) {
          structuredData.skills = data.skills.map(skill => ({
            name: skill.name || skill.raw,
            level: skill.level || "",
            confidence: skill.confidence || 0
          }));
          const scores = data.skills.map(s => s.confidence).filter(Number);
          if (scores.length) {
            confidenceScores.sections.skills = scores.reduce((a, b) => a + b, 0) / scores.length;
          }
        }

        if (Array.isArray(data.workExperience)) {
          structuredData.workExperience = data.workExperience.map(job => ({
            jobTitle: job.jobTitle?.raw || "",
            organization: job.organization?.raw || "",
            location: job.location?.raw || "",
            dates: {
              startDate: job.dates?.startDate?.raw || "",
              endDate: job.dates?.endDate?.raw || ""
            },
            description: job.description || "",
            responsibilities: Array.isArray(job.responsibilities)
              ? job.responsibilities.map(r => r.raw || r).join("\n")
              : job.responsibilities || "",
            achievements: Array.isArray(job.achievements)
              ? job.achievements.map(a => a.raw || a).join("\n")
              : job.achievements || "",
            confidence: job.confidence || 0
          }));
          const scores = data.workExperience.map(j => j.confidence).filter(Number);
          if (scores.length) {
            confidenceScores.sections.workExperience = scores.reduce((a, b) => a + b, 0) / scores.length;
          }
        }

        if (Array.isArray(data.education)) {
          structuredData.education = data.education.map(edu => ({
            institution: edu.organization?.raw || "",
            degree: edu.accreditation?.education || edu.accreditation?.raw || "",
            fieldOfStudy: edu.accreditation?.educationLevel || "",
            dates: {
              startDate: edu.dates?.startDate?.raw || "",
              endDate: edu.dates?.endDate?.raw || ""
            },
            description: edu.description || "",
            gpa: edu.grade || "",
            confidence: edu.confidence || 0
          }));
          const scores = data.education.map(e => e.confidence).filter(Number);
          if (scores.length) {
            confidenceScores.sections.education = scores.reduce((a, b) => a + b, 0) / scores.length;
          }
        }

        if (Array.isArray(data.certifications)) {
          structuredData.certifications = data.certifications.map(cert => ({
            name: cert.name || cert.raw || "",
            issuer: cert.issuer || "",
            date: cert.date || "",
            confidence: cert.confidence || 0
          }));
        }

        if (Array.isArray(data.languages)) {
          structuredData.languages = data.languages.map(lang => ({
            name: lang.name || lang.raw || "",
            level: lang.level || "",
            confidence: lang.confidence || 0
          }));
        }

        const sectionScores = Object.values(confidenceScores.sections).filter(Number);
        if (sectionScores.length) {
          confidenceScores.overall = sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length;
        }

        console.log("✅ Structured data parsed from Affinda");
      } else {
        console.warn("⚠️ No structured parser data found");
      }
    } catch (err) {
      console.error("⚠️ Error processing structured data:", err);
    }

    console.log("📡 Calling Claude API...");
    const claudeResponse = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: `You are an expert resume analyzer and career coach. I need you to analyze my resume for a ${resume.job_title} position.\n\nHere is the EXACT TEXT from my resume:\n\n${resume.resume_text}\n\nAnd here is the job description I'm targeting:\n\n${resume.job_description || "No job description provided"}\n\nAdditionally, I have structured data extracted by a professional resume parser. This represents how an ATS (Applicant Tracking System) might see my resume:\n\n${JSON.stringify({ personalInfo: structuredData.personalInfo, summary: structuredData.summary, skills: structuredData.skills, workExperience: structuredData.workExperience, education: structuredData.education, certifications: structuredData.certifications, languages: structuredData.languages, confidenceScores: confidenceScores }, null, 2)}\n\n[...CONTINUED PROMPT...]`
        }]
      }]
    });

    const analysisText = claudeResponse?.content?.[0]?.text || '';
    if (!analysisText.length) {
      console.error("❌ Claude returned empty");
      return NextResponse.json({ error: 'Claude returned no text' }, { status: 502 });
    }

    const { data: result, error: insertError } = await supabase.from('analyses').insert({
      resume_id: resumeId,
      raw_analysis: analysisText,
      structured_data: structuredData,
      confidence_scores: confidenceScores
    }).select('id').single();

    if (insertError) {
      console.error("❌ Failed to save analysis:", insertError.message);
      return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 });
    }

    return NextResponse.json({ success: true, analysisId: result.id });

  } catch (err) {
    console.error("❌ API route error:", err);
    return NextResponse.json({ error: 'Internal error: ' + err.message }, { status: 500 });
  }
}

