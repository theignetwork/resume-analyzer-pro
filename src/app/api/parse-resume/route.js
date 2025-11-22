import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';
import { parseResumeLimit, checkRateLimit } from '@/lib/rateLimit';

const AFFINDA_API_KEY = process.env.AFFINDA_API_KEY;
const AFFINDA_WORKSPACE_ID = process.env.AFFINDA_WORKSPACE_ID;

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

    if (!AFFINDA_API_KEY || !AFFINDA_WORKSPACE_ID) {
      console.error("Affinda configuration error");
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { resumeId } = await request.json();
    if (!resumeId) return NextResponse.json({ error: 'No resumeId provided' }, { status: 400 });

    const { data: resume, error: resumeError } = await supabase.from('resumes').select('*').eq('id', resumeId).single();
    if (resumeError || !resume?.file_url) {
      return NextResponse.json({ error: resumeError?.message || 'Resume has no file_url' }, { status: 404 });
    }

    // Verify user owns this resume
    if (String(resume.wp_user_id) !== String(user.user_id)) {
      console.log(`[parse-resume] User ${user.user_id} attempted to access resume owned by ${resume.wp_user_id}`);
      return NextResponse.json({ error: 'Unauthorized - Resume does not belong to you' }, { status: 403 });
    }

    const requestBody = {
      url: resume.file_url,
      wait: true,
      workspace: AFFINDA_WORKSPACE_ID,
      documentType: "oprLlBoq",
      identifier: `resume-${resumeId}`
    };

    const affindaResponse = await fetch('https://api.affinda.com/v3/documents', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AFFINDA_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await affindaResponse.text();
    if (!affindaResponse.ok) {
      const errorMessage = (() => {
        try {
          const data = JSON.parse(responseText);
          return data.message || data.detail || affindaResponse.statusText;
        } catch (_) {
          return affindaResponse.statusText;
        }
      })();
      return NextResponse.json({ error: `Affinda API error: ${errorMessage}` }, { status: affindaResponse.status });
    }

    const parsedData = JSON.parse(responseText);
    let resumeText = extractTextFromResponse(parsedData);

    if (!resumeText?.trim()) {
      const fallback = await fetch('https://api.affinda.com/v3/documents/extract-text', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AFFINDA_API_KEY}`
        },
        body: JSON.stringify({ url: resume.file_url })
      });
      if (fallback.ok) {
        const { text } = await fallback.json();
        resumeText = text || resumeText;
      }
    }

    if (!resumeText?.trim() && parsedData.meta?.pdf) {
      resumeText = `Document text could not be automatically extracted. PDF available at: ${parsedData.meta.pdf}`;
    }
    if (!resumeText?.trim()) {
      resumeText = "Text extraction failed. This may be due to the document being an image-based PDF without embedded text.";
    }

    // FIXED: Transform Affinda data to fix the skills field name issue
    const transformedData = {
      ...parsedData,
      data: {
        ...parsedData.data,
        skills: parsedData.data?.skill || [] // Fix: Affinda uses 'skill' not 'skills'
      }
    };

    // Add debug logging to verify the fix
    console.log("=== AFFINDA DATA DEBUG ===");
    console.log("Skills found in Affinda data:", parsedData.data?.skill?.length || 0);
    console.log("Skills after transformation:", transformedData.data?.skills?.length || 0);
    console.log("Work Experience in parsedData:", parsedData.data?.workExperience?.length || 0);
    console.log("Certifications in parsedData:", parsedData.data?.certifications?.length || 0);
    console.log("Languages in parsedData:", parsedData.data?.languages?.length || 0);
    console.log("All Affinda data keys:", Object.keys(parsedData.data || {}));
    if (parsedData.data?.workExperience?.[0]) {
      console.log("Sample work experience object:", JSON.stringify(parsedData.data.workExperience[0], null, 2));
    }
    console.log("========================");

    const documentType = parsedData.meta?.documentType || 'unknown';
    const { error: updateError } = await supabase.from('resumes').update({
      resume_structured_data: transformedData, // FIXED: Using transformed data instead of raw
      resume_text: resumeText,
      parser_version: `v3-${documentType}`
    }).eq('id', resumeId);

    if (updateError) throw updateError;

    return NextResponse.json({ 
      success: true, 
      message: 'Resume parsed successfully', 
      documentType,
      skillsFound: transformedData.data?.skills?.length || 0 // Debug info
    });
  } catch (error) {
    console.error("Parse resume error:", error);
    return NextResponse.json({ error: 'API error: ' + error.message }, { status: 500 });
  }
}

function extractTextFromResponse(data) {
  const searchPaths = [
    'data.rawText', 'data.content', 'data.text',
    'data.resume.rawText', 'data.resume.textAnnotation.parsed',
    'rawText', 'content', 'text'
  ];

  for (const path of searchPaths) {
    const parts = path.split('.');
    let val = data;
    for (const part of parts) val = val?.[part];
    if (typeof val === 'string' && val.length > 100) return val;
  }

  if (Array.isArray(data?.data?.resume?.sections)) {
    const text = data.data.resume.sections.map(s => s.text).filter(Boolean).join('\n\n');
    if (text.length > 100) return text;
  }

  return deepSearchForText(data);
}

function deepSearchForText(obj, depth = 0, maxDepth = 5) {
  if (depth > maxDepth || !obj) return '';
  if (typeof obj === 'string' && obj.length > 100) return obj;
  if (Array.isArray(obj)) return obj.map(o => deepSearchForText(o, depth + 1)).find(Boolean) || '';
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const val = deepSearchForText(obj[key], depth + 1);
      if (val) return val;
    }
  }
  return '';
}
