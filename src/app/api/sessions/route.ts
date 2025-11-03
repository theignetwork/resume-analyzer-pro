import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/sessions - Get user's sessions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wpUserId = searchParams.get('wp_user_id');
    const activeOnly = searchParams.get('active_only') === 'true';

    if (!wpUserId) {
      return NextResponse.json({ error: 'wp_user_id required' }, { status: 400 });
    }

    let query = supabase
      .from('analysis_sessions')
      .select('*')
      .eq('wp_user_id', parseInt(wpUserId))
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
    const body = await request.json();
    const { wp_user_id, job_title, job_description, company_name } = body;

    if (!wp_user_id || !job_title) {
      return NextResponse.json(
        { error: 'wp_user_id and job_title are required' },
        { status: 400 }
      );
    }

    // Create session name from job title and company
    const sessionName = company_name
      ? `${job_title} at ${company_name}`
      : job_title;

    const { data: session, error } = await supabase
      .from('analysis_sessions')
      .insert({
        wp_user_id: parseInt(wp_user_id),
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
