# WordPress Integration for Resume Analyzer Pro

## Overview
This integration allows Resume Analyzer Pro to work seamlessly with your WordPress/MemberPress site, enabling user authentication and session management features.

## Setup Instructions

### 1. Add the iframe to your WordPress page

Copy the contents of `resume-analyzer-iframe.html` and paste it into:
- **WordPress Admin** → **Pages** → **Add New** (or edit existing page)
- Use **Custom HTML block** to paste the code
- Or create a shortcode (see below)

### 2. Configure MemberPress Integration

The WordPress page needs to pass the JWT token via the URL parameter. You'll need to set up your MemberPress to generate the token.

**Your WordPress page URL should look like:**
```
https://members.theinterviewguys.com/resume-analyzer/?context=<JWT_TOKEN>
```

### 3. JWT Token Generation (PHP)

You likely already have this setup for your other tools (Cover Letter Generator, Oracle Pro, IG Interview Coach). If not, add this to your theme's `functions.php`:

```php
<?php
// Generate JWT token for IG Network tools
function ig_generate_jwt_token() {
    if (!is_user_logged_in()) {
        return '';
    }

    $user = wp_get_current_user();
    $user_id = get_current_user_id();

    // Get membership level
    $membership = pmpro_getMembershipLevelForUser($user_id);
    $membership_level = $membership ? $membership->name : 'Free';

    // Create JWT payload
    $payload = [
        'user_id' => $user_id,
        'email' => $user->user_email,
        'name' => $user->display_name,
        'membership_level' => $membership_level,
        'iat' => time(),
        'exp' => time() + (24 * 60 * 60) // 24 hour expiry
    ];

    // JWT Secret (must match .env.local in Next.js app)
    $secret = '41d7608f24c106eeab002add62ea7b614173a6a6e9a95eaee7505936d8c51edc';

    // Generate JWT (simplified - use a proper JWT library for production)
    $header = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload_encoded = base64_encode(json_encode($payload));

    $signature = hash_hmac('sha256', "$header.$payload_encoded", $secret, true);
    $signature_encoded = base64_encode($signature);

    // Remove base64 padding
    $header = str_replace('=', '', $header);
    $payload_encoded = str_replace('=', '', $payload_encoded);
    $signature_encoded = str_replace('=', '', $signature_encoded);

    return "$header.$payload_encoded.$signature_encoded";
}

// Redirect to Resume Analyzer with JWT token
function ig_resume_analyzer_redirect() {
    if (is_page('resume-analyzer')) { // Change 'resume-analyzer' to your page slug
        $token = ig_generate_jwt_token();
        if ($token && !isset($_GET['context'])) {
            wp_redirect(add_query_arg('context', $token, get_permalink()));
            exit;
        }
    }
}
add_action('template_redirect', 'ig_resume_analyzer_redirect');
?>
```

### 4. Update Netlify URL (if needed)

In `resume-analyzer-iframe.html`, update the iframe src to match your Netlify deployment URL:

```javascript
const iframeSrc = 'https://YOUR-ACTUAL-NETLIFY-URL.netlify.app/?context=' + encodeURIComponent(contextToken);
```

**Current URL:** `https://resume-analyzer-pro-v2.netlify.app/`

## How It Works

1. **User visits WordPress page** → MemberPress authenticates user
2. **PHP generates JWT token** with user data (user_id, email, name, membership_level)
3. **URL includes token** → `?context=<JWT_TOKEN>`
4. **JavaScript extracts token** from page URL
5. **Iframe loads with token** → Next.js app receives token
6. **AuthContext decodes JWT** → User authenticated in app
7. **Session features enabled** → User can track resume versions

## Features Enabled with Authentication

✅ **Session Management** - Group multiple resume versions per job application
✅ **Auto-fill Job Descriptions** - No need to re-enter on subsequent uploads
✅ **Version Tracking** - v1, v2, v3 with auto-increment
✅ **Score History** - See improvement over time (+7, -3, etc.)
✅ **SessionBanner** - Quick access to previous sessions
✅ **VersionHistory** - Visual score progression

## Testing

1. **Add iframe to WordPress page** (copy from `resume-analyzer-iframe.html`)
2. **Access page as logged-in user** → Token should auto-generate
3. **Open browser console (F12)** → Should see:
   ```
   🚀 Initializing Resume Analyzer PRO...
   🔍 Context token found: YES
   📍 Setting iframe URL with context token
   ✅ Resume Analyzer PRO initialized with authentication!
   ```
4. **Upload resume** → Creates session v1
5. **Return to page** → SessionBanner appears with previous session
6. **Select session** → Job description pre-fills
7. **Upload new resume** → Creates v2, shows score comparison

## Troubleshooting

### No SessionBanner appearing?
- Check browser console for `[Auth]` and `[Upload]` logs
- Verify `context` parameter is in URL
- Ensure JWT secret matches between WordPress and Next.js app

### "User state: null" in console?
- JWT token is not being passed correctly
- Check if PHP JWT generation is working
- Verify iframe JavaScript is loading

### Sessions not saving?
- Check Supabase connection
- Verify environment variables in Netlify
- Check browser console for API errors

## Environment Variables (Netlify)

Ensure these are set in Netlify dashboard:

```env
JWT_SECRET=41d7608f24c106eeab002add62ea7b614173a6a6e9a95eaee7505936d8c51edc
NEXT_PUBLIC_JWT_SECRET=41d7608f24c106eeab002add62ea7b614173a6a6e9a95eaee7505936d8c51edc
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-key>
ANTHROPIC_API_KEY=<your-anthropic-key>
```

## Support

For issues or questions:
1. Check browser console for detailed logs
2. Verify JWT token is being generated
3. Test with a simple token to isolate issues
4. Compare with working tools (Cover Letter Generator, Oracle Pro)
