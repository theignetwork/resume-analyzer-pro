import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { readSessionLimit, createSessionLimit, checkRateLimit } from '@/lib/rateLimit';

// GET /api/sessions - Get user's sessions
export async function GET(request: Request) {
  try {
    // Authentication check
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      console.log('[sessions] Unauthorized GET request');
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }
    console.log(`[sessions] Authenticated GET request from user ${userId}`);

    // Rate limit check (100 requests per hour for reads)
    const rateLimitResult = await checkRateLimit(
      readSessionLimit,
      `user_${userId}`,
      'session reads',
      100
    );
    if (!rateLimitResult.success) {
      return rateLimitResult.response;
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active_only') === 'true';

    // Use authenticated userId instead of query param!
    let query = supabase
      .from('analysis_sessions')
      .select('*')
      .eq('wp_user_id', userId)
      .order('updated_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data: sessions, error } = await query.limit(10);

    if (error) {
      console.error('Error fetching sessions:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/sessions - Create new session
export async function POST(request: Request) {
  try {
    // Authentication check
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      console.log('[sessions] Unauthorized POST request');
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }
    console.log(`[sessions] Authenticated POST request from user ${userId}`);

    // Rate limit check (20 requests per hour for creates)
    const rateLimitResult = await checkRateLimit(
      createSessionLimit,
      `user_${userId}`,
      'session creation',
      20
    );
    if (!rateLimitResult.success) {
      return rateLimitResult.response;
    }

    const body = await request.json();
    const { job_title, job_description, company_name } = body;

    if (!job_title) {
      return NextResponse.json(
        { error: 'job_title is required' },
        { status: 400 }
      );
    }

    // Create session name from job title and company
    const sessionName = company_name
      ? `${job_title} at ${company_name}`
      : job_title;

    // Use authenticated userId instead of body param!
    const { data: session, error } = await supabase
      .from('analysis_sessions')
      .insert({
        wp_user_id: userId,
        job_title,
        job_description,
        company_name,
        session_name: sessionName,
        is_active: true,
        total_uploads: 0,
        best_score: 0,
        latest_score: null,
        score_history: []
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session }, { status: 201 });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
