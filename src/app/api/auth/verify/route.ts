/**
 * Server-side JWT token verification endpoint
 * Keeps the JWT secret on the server only (never exposed to client)
 */

import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 400 });
    }

    // Get secret from server environment ONLY (not exposed to client!)
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error('[Auth Verify] JWT_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Verify the JWT
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);

    console.log(`[Auth Verify] Token verified for user ${payload.user_id}`);

    // Return user data
    return NextResponse.json({
      user: payload,
      valid: true
    });

  } catch (error) {
    console.error('[Auth Verify] Token verification failed:', error);
    return NextResponse.json({
      error: 'Invalid or expired token',
      valid: false
    }, { status: 401 });
  }
}
