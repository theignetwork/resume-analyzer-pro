import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';

// GET /api/sessions/[id] - Get specific session
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Authentication check
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      console.log('[sessions/id] Unauthorized GET request');
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }

    const { data: session, error } = await supabase
      .from('analysis_sessions')
      .select(`
        *,
        resumes(id, version_number, file_name, created_at, analyses(overall_score))
      `)
      .eq('id', params.id)
      .single();

    if (error) {
      console.error('Error fetching session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify user owns this session
    if (String(session.wp_user_id) !== String(userId)) {
      console.log(`[sessions/id] User ${userId} attempted to access session owned by ${session.wp_user_id}`);
      return NextResponse.json({ error: 'Unauthorized - Session does not belong to you' }, { status: 403 });
    }

    return NextResponse.json({ session });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/sessions/[id] - Update session
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Authentication check
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      console.log('[sessions/id] Unauthorized PUT request');
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }

    // First verify the session exists and user owns it
    const { data: existingSession } = await supabase
      .from('analysis_sessions')
      .select('wp_user_id')
      .eq('id', params.id)
      .single();

    if (!existingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify user owns this session
    if (String(existingSession.wp_user_id) !== String(userId)) {
      console.log(`[sessions/id] User ${userId} attempted to update session owned by ${existingSession.wp_user_id}`);
      return NextResponse.json({ error: 'Unauthorized - Session does not belong to you' }, { status: 403 });
    }

    const body = await request.json();
    const updates: any = {};

    // Allow updating specific fields
    if (body.total_uploads !== undefined) updates.total_uploads = body.total_uploads;
    if (body.latest_score !== undefined) updates.latest_score = body.latest_score;
    if (body.best_score !== undefined) updates.best_score = body.best_score;
    if (body.score_history !== undefined) updates.score_history = body.score_history;
    if (body.last_upload_at !== undefined) updates.last_upload_at = body.last_upload_at;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    // updated_at is handled by trigger

    const { data: session, error } = await supabase
      .from('analysis_sessions')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/sessions/[id] - Mark session as inactive
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Authentication check
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      console.log('[sessions/id] Unauthorized DELETE request');
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }

    // First verify the session exists and user owns it
    const { data: existingSession } = await supabase
      .from('analysis_sessions')
      .select('wp_user_id')
      .eq('id', params.id)
      .single();

    if (!existingSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Verify user owns this session
    if (String(existingSession.wp_user_id) !== String(userId)) {
      console.log(`[sessions/id] User ${userId} attempted to delete session owned by ${existingSession.wp_user_id}`);
      return NextResponse.json({ error: 'Unauthorized - Session does not belong to you' }, { status: 403 });
    }

    const { data: session, error } = await supabase
      .from('analysis_sessions')
      .update({ is_active: false })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error deleting session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session, message: 'Session marked as inactive' });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
