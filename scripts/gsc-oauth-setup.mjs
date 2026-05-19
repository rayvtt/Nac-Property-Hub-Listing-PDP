#!/usr/bin/env node
// One-time helper to obtain a Google OAuth refresh token for Search Console.
// Run locally (not in CI). Output: a refresh_token to paste into GitHub
// secrets as GSC_OAUTH_REFRESH_TOKEN.
//
// Why OAuth and not a service account: GSC's UI has been blocking service
// account user-adds. OAuth delegation (the API calls run as YOU) sidesteps
// the issue entirely — works on every property you own.
//
// Setup (one-time, before running this script):
//   1. Google Cloud Console → APIs & Services → Credentials
//   2. Create credentials → OAuth client ID → Application type: Desktop app
//   3. Copy the client ID and client secret
//   4. Export them:
//        export GSC_OAUTH_CLIENT_ID="...apps.googleusercontent.com"
//        export GSC_OAUTH_CLIENT_SECRET="..."
//   5. Run this script:  cd scripts && node gsc-oauth-setup.mjs
//   6. Browser will open; sign in with the Google account that OWNS the GSC
//      property for nomadassetcollective.com. Grant the read-only consent.
//   7. Script prints the refresh_token. Add it as repo secret:
//        GSC_OAUTH_CLIENT_ID
//        GSC_OAUTH_CLIENT_SECRET
//        GSC_OAUTH_REFRESH_TOKEN

import { google } from 'googleapis';
import http from 'node:http';
import { URL } from 'node:url';

const CLIENT_ID = process.env.GSC_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GSC_OAUTH_CLIENT_SECRET;
const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/oauth-callback`;
const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GSC_OAUTH_CLIENT_ID or GSC_OAUTH_CLIENT_SECRET.');
  console.error('See the top of this file for setup instructions.');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n1. Open this URL in your browser:\n');
console.log('   ' + authUrl + '\n');
console.log('2. Sign in with the Google account that OWNS the GSC property.');
console.log('3. Grant read-only Search Console consent.\n');
console.log(`Listening on http://localhost:${PORT} for the callback …\n`);

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/oauth-callback')) {
    res.writeHead(404).end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`Auth error: ${error}`);
    console.error(`\n✗ Auth failed: ${error}`);
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error(
        'No refresh_token returned. This usually means you have already authorized this OAuth client before — revoke access at https://myaccount.google.com/permissions and re-run.'
      );
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      '<h1>✓ Refresh token captured.</h1><p>Return to the terminal — the token is printed there. You can close this tab.</p>'
    );

    console.log('\n✓ Success.\n');
    console.log('────────────────────────────────────────────────────────────');
    console.log('Add these THREE values as repo secrets in GitHub:');
    console.log('────────────────────────────────────────────────────────────');
    console.log(`GSC_OAUTH_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GSC_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GSC_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('────────────────────────────────────────────────────────────\n');

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Token exchange failed: ${err.message}`);
    console.error(`\n✗ Token exchange failed: ${err.message}`);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT);
