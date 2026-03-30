/**
 * Rate Limiting Configuration using Upstash Redis
 * Prevents API abuse and protects expensive API credits
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Initialize Redis client from environment variables
// Required: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Rate limit for resume parsing
 * Limit: 5 requests per hour per user
 */
export const parseResumeLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: true,
  prefix: "ratelimit:parse",
});

/**
 * Rate limit for resume analysis (Anthropic API - expensive)
 * Limit: 10 requests per hour per user
 */
export const analyzeLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  analytics: true,
  prefix: "ratelimit:analyze",
});

/**
 * Rate limit for session creation (database writes - moderate cost)
 * Limit: 20 requests per hour per user
 */
export const createSessionLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"),
  analytics: true,
  prefix: "ratelimit:session:create",
});

/**
 * Rate limit for session reads (database reads - cheap but prevent scraping)
 * Limit: 100 requests per hour per user
 */
export const readSessionLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 h"),
  analytics: true,
  prefix: "ratelimit:session:read",
});

/**
 * Helper function to check rate limit and return formatted error response
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
  limitName: string,
  maxRequests: number
): Promise<{ success: boolean; response?: Response; remaining?: number }> {

  const { success, limit, reset, remaining } = await limiter.limit(identifier);

  if (!success) {
    const minutesUntilReset = Math.ceil((reset - Date.now()) / 60000);

    console.log(`[Rate Limit] ${limitName} exceeded for ${identifier}. Reset in ${minutesUntilReset} minutes.`);

    return {
      success: false,
      response: Response.json(
        {
          error: `Rate limit exceeded. You can make ${maxRequests} ${limitName} requests per hour. Please try again in ${minutesUntilReset} minute${minutesUntilReset === 1 ? '' : 's'}.`,
          limit: maxRequests,
          remaining: 0,
          resetIn: minutesUntilReset,
          resetAt: new Date(reset).toISOString()
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString()
          }
        }
      )
    };
  }

  console.log(`[Rate Limit] ${limitName} check passed for ${identifier}. ${remaining}/${limit} remaining.`);

  return {
    success: true,
    remaining
  };
}
