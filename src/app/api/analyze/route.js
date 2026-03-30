import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';
import { analyzeLimit, checkRateLimit } from '@/lib/rateLimit';

export const maxDuration = 60;

export async function POST(request) {
  try {
    // Authentication check
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }

    // Rate limit check
    const rateLimitResult = await checkRateLimit(
      analyzeLimit,
      `user_${user.user_id}`,
      'resume analysis',
      10
    );
    if (!rateLimitResult.success) {
      return rateLimitResult.response;
    }

    const body = await request.json();
    const { resumeId } = body;

    if (!resumeId) {
      return NextResponse.json({ error: 'No resumeId provided' }, { status: 400 });
    }

    // Fetch resume to validate
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('id, wp_user_id, resume_text')
      .eq('id', resumeId)
      .single();

    if (resumeError || !resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    if (String(resume.wp_user_id) !== String(user.user_id)) {
      return NextResponse.json({ error: 'Unauthorized - Resume does not belong to you' }, { status: 403 });
    }

    if (!resume.resume_text) {
      return NextResponse.json({ error: 'Resume has no extracted text. Please re-upload.' }, { status: 400 });
    }

    // Create a placeholder analysis record
    const { data: analysis, error: insertError } = await supabase
      .from('analyses')
      .insert({
        resume_id: resumeId,
        wp_user_id: resume.wp_user_id,
        raw_analysis: null,
        overall_score: 0,
        ats_score: 0,
        formatting_score: 0,
        content_score: 0,
        relevance_score: 0,
        strengths: [],
        improvements: [],
        danger_alerts: [],
        keyword_analysis: [],
        improved_sections: {},
        structured_data: {},
        confidence_scores: {}
      })
      .select('id')
      .single();

    if (insertError) {
      console.error("[analyze] Failed to create placeholder:", insertError);
      return NextResponse.json({ error: 'Database error: ' + insertError.message }, { status: 500 });
    }

    console.log("[analyze] Created placeholder analysis:", analysis.id);

    // Trigger the background function
    const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'https://resume-analyzer-pro-v2.netlify.app';
    const bgUrl = `${siteUrl}/.netlify/functions/run-analysis-background`;

    console.log("[analyze] Triggering background function at:", bgUrl);

    // Fire and forget - don't await
    fetch(bgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeId,
        analysisId: analysis.id,
        wpUserId: resume.wp_user_id
      })
    }).catch(err => {
      console.error("[analyze] Background function trigger error:", err.message);
    });

    return NextResponse.json({
      success: true,
      analysisId: analysis.id,
      status: 'processing',
      message: 'Analysis started'
    });

  } catch (err) {
    console.error("[analyze] Error:", err);
    return NextResponse.json({ error: 'API error: ' + (err.message || 'Unknown error') }, { status: 500 });
  }
}
