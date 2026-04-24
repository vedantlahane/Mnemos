# Extension Deployment Guide

## Problem: "Fetch failed loading HEAD" Error

If you see this error in the browser console:
```
Fetch failed loading: HEAD "https://mnem0s.vercel.app/"
Unexpected token '<', "<!doctype "... is not valid JSON
```

It means the extension is trying to fetch API responses from the wrong URL and receiving HTML instead of JSON.

## Root Cause

The extension needs to know:
1. **Backend URL**: Where the API server is running (e.g., `https://api.example.com`)
2. **Frontend URL**: Where the web app is running (e.g., `https://app.example.com`)

If these are not configured correctly for production, the extension will use fallback values that don't work.

## Solution: Configure Environment Variables

### For Production Builds

1. **Create or update `.env` in the `extension/` folder:**

```bash
# extension/.env (PRODUCTION)
PLASMO_PUBLIC_BACKEND_URL=https://api.your-domain.com
PLASMO_PUBLIC_FRONTEND_URL=https://app.your-domain.com
```

2. **For Vercel deployments**, add these environment variables to your Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add `PLASMO_PUBLIC_BACKEND_URL` 
   - Add `PLASMO_PUBLIC_FRONTEND_URL`

3. **Rebuild and deploy the extension:**

```bash
cd extension
npm run build  # or pnpm build
npm run package  # to create the extension archive
```

### Backend Requirements

Make sure your backend is configured to accept requests from the extension:

**In `backend/app/main.py`**, ensure CORS origins include your domain:

```python
# Verify CORS is configured for production
CORS_ORIGINS should include:
- Your backend domain (e.g., https://api.your-domain.com)
- Your frontend domain (e.g., https://app.your-domain.com)
```

## Default Fallbacks (Development)

If environment variables are not set:
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

These only work during local development.

## Testing the Configuration

1. **Build the extension with production URLs:**
   ```bash
   cd extension
   PLASMO_PUBLIC_BACKEND_URL=https://your-backend.com \
   PLASMO_PUBLIC_FRONTEND_URL=https://your-frontend.com \
   npm run build
   ```

2. **Load the extension in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select `extension/build/chrome-mv3-prod/`

3. **Check console for errors:**
   - Open DevTools on your app
   - Look for fetch errors in the Console tab
   - Should see successful API calls to your backend domain

## Debugging Tips

- **Check the Network tab** in DevTools to see where requests are being sent
- **Look for Content-Type headers** in responses - should be `application/json`
- **Enable extension logs** by clicking the extension icon → Inspect popup
- **Verify backend accessibility** by visiting your API endpoint directly in the browser

## Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `PLASMO_PUBLIC_BACKEND_URL` | API server location | `https://api.mnem0s.com` |
| `PLASMO_PUBLIC_FRONTEND_URL` | Web app location | `https://app.mnem0s.com` |

## Common Issues

### Issue: "Expected JSON response, got text/html"
- **Cause**: Backend URL is wrong (pointing to frontend or error page)
- **Fix**: Verify `PLASMO_PUBLIC_BACKEND_URL` is set to actual backend domain

### Issue: "HTTP 404" or "HTTP 500" errors
- **Cause**: Backend is unreachable or API endpoint doesn't exist
- **Fix**: Check backend deployment and CORS configuration

### Issue: CORS errors
- **Cause**: Backend CORS headers don't include frontend domain
- **Fix**: Update backend CORS configuration to include all domains
