// dropbox-auth.js — the proper "Connect to Dropbox" flow (OAuth 2 + PKCE).
// ===================================================================
// WHY this exists: the manually-generated token expires after ~4 hours,
// which is useless for a daily app. This flow instead gets a *refresh
// token* that never expires; the app trades it for a fresh short-lived
// access token automatically whenever needed. The user just clicks
// "Connect", approves once on Dropbox's site, and never thinks about it again.
//
// SECURITY: PKCE ("Proof Key for Code Exchange") is the flow designed for
// apps with no server and public code. There is NO app secret in here — that's
// the whole point of PKCE. The only embedded value is the APP KEY, which
// Dropbox treats as public (it's fine to be visible in the GitHub code).
//
// The refresh token IS sensitive (it's the durable key to the Dash folder).
// It's stored only in this device's localStorage, never uploaded anywhere.

// Public app key for the "Dash-Andra" Dropbox app. Safe to be public.
export const DROPBOX_APP_KEY = "bhb0hatauzgxttn";

// Must exactly match a Redirect URI registered in the Dropbox app console.
export const REDIRECT_URI = "https://ladyandra.github.io/dash/";

const AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

const LS_REFRESH = "dash.dropbox.refresh";  // durable refresh token (per device)
const LS_ACCESS = "dash.dropbox.access";    // short-lived access token cache
const LS_EXPIRES = "dash.dropbox.expires";  // ms epoch when access token dies
const SS_VERIFIER = "dash.dropbox.pkce_verifier"; // sessionStorage, transient

// ---- PKCE helpers ----
function randomVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}
async function challengeFrom(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
function base64url(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---- Step 1: send the user to Dropbox to approve ----
export async function beginConnect() {
  const verifier = randomVerifier();
  sessionStorage.setItem(SS_VERIFIER, verifier);
  const challenge = await challengeFrom(verifier);
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",   // <- this is what yields a REFRESH token
  });
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

// ---- Step 2: back from Dropbox with ?code=… — exchange it for tokens ----
// Returns true if we completed a connection (and cleans the URL).
export async function completeConnectIfReturning() {
  if (typeof window === "undefined" || !window.location || !window.location.href) return false;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return false;

  const verifier = sessionStorage.getItem(SS_VERIFIER);
  if (!verifier) return false; // not our flow / verifier lost
  sessionStorage.removeItem(SS_VERIFIER);

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: DROPBOX_APP_KEY,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, { method: "POST", body });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Dropbox sign-in failed (${res.status}). ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.refresh_token) localStorage.setItem(LS_REFRESH, data.refresh_token);
  if (data.access_token) {
    localStorage.setItem(LS_ACCESS, data.access_token);
    localStorage.setItem(LS_EXPIRES, String(Date.now() + (data.expires_in || 14400) * 1000));
  }
  // strip ?code=… from the address bar so a refresh doesn't re-trigger
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());
  return true;
}

export function isConnected() {
  return !!localStorage.getItem(LS_REFRESH);
}

export function disconnect() {
  localStorage.removeItem(LS_REFRESH);
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_EXPIRES);
}

// ---- Get a currently-valid access token, refreshing if needed ----
// This is the magic: callers never deal with expiry. If the cached access
// token is still good, return it; otherwise silently trade the refresh token
// for a new one. The refresh token itself never expires.
export async function getAccessToken() {
  const refresh = localStorage.getItem(LS_REFRESH);
  if (!refresh) return null;

  const cached = localStorage.getItem(LS_ACCESS);
  const expires = parseInt(localStorage.getItem(LS_EXPIRES) || "0", 10);
  // refresh a minute early to avoid races near the boundary
  if (cached && Date.now() < expires - 60000) return cached;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: DROPBOX_APP_KEY,
  });
  const res = await fetch(TOKEN_URL, { method: "POST", body });
  if (!res.ok) {
    // refresh token revoked/invalid — force a reconnect
    if (res.status === 400 || res.status === 401) disconnect();
    throw new Error(`Couldn't refresh Dropbox access (${res.status}). You may need to reconnect.`);
  }
  const data = await res.json();
  localStorage.setItem(LS_ACCESS, data.access_token);
  localStorage.setItem(LS_EXPIRES, String(Date.now() + (data.expires_in || 14400) * 1000));
  return data.access_token;
}
