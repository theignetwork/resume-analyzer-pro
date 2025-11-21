/**
 * Server-side authentication utilities
 * Verifies JWT tokens and extracts user information
 */

import { jwtVerify } from 'jose';

interface UserPayload {
  user_id: number;
  email: string;
  name: string;
  membership_level: string;
  exp?: number;
  iat?: number;
}

/**
 * Extract and verify JWT token from request
 * Checks both Authorization header and x-auth-token header
 *
 * @param request - The incoming request
 * @returns User payload if valid, null if invalid or missing
 */
export async function getUserFromRequest(request: Request): Promise<UserPayload | null> {
  try {
    // Check for token in headers
    const authHeader = request.headers.get('authorization');
    const xAuthToken = request.headers.get('x-auth-token');

    let token: string | null = null;

    // Try Authorization header (Bearer token format)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    // Try x-auth-token header
    else if (xAuthToken) {
      token = xAuthToken;
    }

    if (!token) {
      console.log('[Auth] No token found in request headers');
      return null;
    }

    // Get secret from server environment ONLY
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error('[Auth] JWT_SECRET not configured');
      return null;
    }

    // Verify the JWT
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);

    console.log(`[Auth] Token verified for user ${payload.user_id}`);

    return payload as UserPayload;

  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return null;
  }
}

/**
 * Extract user ID from request (convenience function)
 *
 * @param request - The incoming request
 * @returns User ID if valid, null if invalid or missing
 */
export async function getUserIdFromRequest(request: Request): Promise<number | null> {
  const user = await getUserFromRequest(request);
  return user ? user.user_id : null;
}
