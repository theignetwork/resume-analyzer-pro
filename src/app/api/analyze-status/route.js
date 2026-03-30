import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const analysisId = searchParams.get('id');

    if (!analysisId) {
      return NextResponse.json({ error: 'No analysis ID provided' }, { status: 400 });
    }

    const { data: analysis, error } = await supabase
      .from('analyses')
      .select('id, raw_analysis, overall_score')
      .eq('id', analysisId)
      .single();

    if (error || !analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    // Verify ownership
    const { data: fullAnalysis } = await supabase
      .from('analyses')
      .select('wp_user_id')
      .eq('id', analysisId)
      .single();

    if (String(fullAnalysis?.wp_user_id) !== String(user.user_id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if analysis is complete
    if (!analysis.raw_analysis) {
      return NextResponse.json({ status: 'processing', analysisId });
    }

    // Check for error
    if (analysis.raw_analysis.startsWith('ERROR:')) {
      return NextResponse.json({
        status: 'error',
        analysisId,
        error: analysis.raw_analysis.replace('ERROR: ', '')
      });
    }

    return NextResponse.json({
      status: 'complete',
      analysisId
    });

  } catch (err) {
    console.error("[analyze-status] Error:", err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
