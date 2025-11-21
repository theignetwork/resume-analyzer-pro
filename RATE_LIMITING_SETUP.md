# ⚡ Rate Limiting Setup - Upstash Redis

**Date:** November 21, 2025
**Project:** Resume Analyzer Pro v2
**Status:** ✅ CODE READY - NEEDS UPSTASH SETUP

---

## 🎯 What Is Rate Limiting?

Rate limiting prevents users (both legitimate and malicious) from making too many API requests in a short time period.

**Benefits:**
- ✅ Prevents API credit abuse (like the Nov 20th incident)
- ✅ Protects against malicious attacks
- ✅ Prevents accidental infinite loops
- ✅ Ensures fair usage for all users

---

## 📊 Rate Limits Configured

| Endpoint | Limit | Why |
|----------|-------|-----|
| `/api/parse-resume` | **5/hour** | Affinda API is expensive |
| `/api/analyze` | **10/hour** | Anthropic API is expensive |
| `/api/sessions` GET | **100/hour** | Prevent data scraping |
| `/api/sessions` POST | **20/hour** | Prevent spam sessions |

**These limits are per user** - each user gets their own quota.

---

## 🚀 Step 1: Create Free Upstash Account

1. **Go to:** https://upstash.com
2. **Sign up** with GitHub or email (free!)
3. **Free tier includes:**
   - 10,000 requests per day
   - 10 MB storage
   - Perfect for this use case

---

## 🔧 Step 2: Create Redis Database

1. **In Upstash Dashboard**, click **"Create Database"**

2. **Configure:**
   - **Name:** `resume-analyzer-rate-limit`
   - **Type:** Regional (cheaper, faster)
   - **Region:** Choose closest to your Netlify region
   - **Eviction:** No eviction needed (rate limit data expires automatically)

3. **Click "Create"**

4. **Copy credentials:**
   - Click on your new database
   - Click **"REST API"** tab
   - Copy these two values:
     - `UPSTASH_REDIS_REST_URL`
     - `UPSTASH_REDIS_REST_TOKEN`

---

## 🔐 Step 3: Add Environment Variables to Netlify

1. **Go to Netlify Dashboard**
2. **Select:** resume-analyzer-pro-v2 site
3. **Go to:** Site Settings → Environment Variables
4. **Add these two variables:**

### Variable 1:
- **Key:** `UPSTASH_REDIS_REST_URL`
- **Value:** (paste from Upstash dashboard - looks like `https://us1-xxxxx.upstash.io`)
- **Scopes:** All scopes

### Variable 2:
- **Key:** `UPSTASH_REDIS_REST_TOKEN`
- **Value:** (paste from Upstash dashboard - long string starting with `AYxxxx`)
- **Scopes:** All scopes

5. **Save changes**

---

## 🎬 Step 4: Deploy

After adding environment variables:

1. **Trigger a new deployment** (environment variables only apply to new builds)
   - Go to Deploys → Trigger Deploy → Deploy site

2. **Or push the code changes** (automatic deployment):
   ```bash
   git add .
   git commit -m "Add rate limiting with Upstash Redis"
   git push
   ```

---

## ✅ Step 5: Verify It's Working

### Test 1: Normal Usage (Should Work)
1. Log into Resume Analyzer
2. Upload a resume
3. Should work normally
4. Check browser Network tab → look for response headers:
   - `X-RateLimit-Limit: 5`
   - `X-RateLimit-Remaining: 4` (or 3, 2, 1...)

### Test 2: Rate Limit Exceeded (Should Block)
1. Upload 6 resumes in a row (quickly)
2. On the 6th request, you should get:
   ```json
   {
     "error": "Rate limit exceeded. You can make 5 resume parsing requests per hour. Please try again in 58 minutes.",
     "limit": 5,
     "remaining": 0,
     "resetIn": 58
   }
   ```
3. Status code: `429 Too Many Requests`

### Test 3: Check Upstash Dashboard
1. Go to Upstash dashboard
2. Click on your database
3. Click **"Data Browser"**
4. You should see keys like:
   - `ratelimit:parse:user_123`
   - `ratelimit:analyze:user_123`
5. These show rate limit tracking for each user

---

## 📊 How It Works

### Before Rate Limiting:
```
User uploads 1000 resumes in 1 minute
→ 1000 Affinda API calls
→ $$$ expensive!
```

### After Rate Limiting:
```
User uploads 1000 resumes in 1 minute
→ First 5 succeed
→ Requests 6-1000 get blocked with 429 error
→ User must wait 1 hour to upload more
→ Only 5 Affinda API calls! ✅
```

---

## 🔍 Rate Limit Response Format

When a user is rate limited, they receive:

**Status:** `429 Too Many Requests`

**Headers:**
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700000000000
Retry-After: 3540
```

**Body:**
```json
{
  "error": "Rate limit exceeded. You can make 5 resume parsing requests per hour. Please try again in 59 minutes.",
  "limit": 5,
  "remaining": 0,
  "resetIn": 59,
  "resetAt": "2025-11-21T16:00:00.000Z"
}
```

---

## 🎛️ Adjusting Rate Limits

If you need to change the limits later, edit `src/lib/rateLimit.ts`:

```typescript
// Increase parse limit from 5 to 10 per hour
export const parseResumeLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"), // Changed from 5
  analytics: true,
  prefix: "ratelimit:parse",
});
```

**Then redeploy** for changes to take effect.

---

## 💰 Upstash Pricing

**Free Tier (Perfect for this project):**
- 10,000 requests/day
- 10 MB storage
- No credit card required

**Paid Tiers (if you exceed free tier):**
- Pay-as-you-go pricing
- ~$0.20 per 100k requests
- Very affordable

**Estimated usage for Resume Analyzer:**
- 100 users × 5 requests/day = 500 requests/day
- Well within free tier!

---

## 🛡️ Security Benefits

### Protection Against:
1. **Malicious Attacks** - Scripts trying to spam your API
2. **Compromised Accounts** - Even if someone steals a JWT, limited damage
3. **Accidental Loops** - Client-side bugs causing infinite requests
4. **Credit Card Fraud** - Users trying to abuse your Affinda/Anthropic credits

### Example Attack Scenario:

**Without Rate Limiting:**
```
Attacker gets valid JWT token
→ Writes script to call /api/parse-resume 10,000 times
→ 10,000 Affinda API calls = $100s of dollars
→ You're bankrupt 😢
```

**With Rate Limiting:**
```
Attacker gets valid JWT token
→ Writes script to call /api/parse-resume 10,000 times
→ First 5 succeed
→ Remaining 9,995 get blocked (429 error)
→ Only 5 Affinda API calls = $0.50
→ You're safe! 😊
```

---

## 📝 Files Changed

### New Files:
- ✅ `src/lib/rateLimit.ts` - Rate limiting configuration

### Modified Files:
- ✅ `src/app/api/parse-resume/route.js` - Added rate limiting
- ✅ `src/app/api/analyze/route.js` - Added rate limiting
- ✅ `src/app/api/sessions/route.ts` - Added rate limiting (GET & POST)
- ✅ `package.json` - Added @upstash/ratelimit and @upstash/redis

---

## 🧪 Testing Checklist

After deploying:

- [ ] Create Upstash account
- [ ] Create Redis database
- [ ] Copy REST API credentials
- [ ] Add env vars to Netlify
- [ ] Trigger new deployment
- [ ] Test: Upload 1 resume (should work)
- [ ] Test: Upload 5 resumes quickly (all should work)
- [ ] Test: Upload 6th resume (should get 429 error)
- [ ] Check Upstash dashboard for rate limit keys
- [ ] Wait 1 hour, upload again (should work)

---

## 🎉 Summary

**Rate limiting is now implemented!**

Once you add the Upstash credentials to Netlify, your API will be protected from:
- ✅ Credit abuse (like Nov 20th)
- ✅ Malicious attacks
- ✅ Accidental spam
- ✅ Account compromise damage

**Cost:** $0/month (free tier)
**Setup time:** 5 minutes
**Protection:** Priceless! 🛡️

---

_Created: November 21, 2025_
_Status: READY FOR UPSTASH SETUP_

