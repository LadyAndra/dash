// dropbox.js — a tiny Dropbox client (just the calls Dash needs).
// ===================================================================
// This is the piece that makes automatic sync work on ALL THREE devices,
// including iPhone/iPad — Dropbox's HTTP API is reachable from any browser,
// unlike an iCloud folder (which only the Mac's browser can open).
//
// The access token is supplied by the user in Settings and lives only on the
// device (localStorage), NEVER in the app's public code. We pass it as a
// Bearer header on each request. Scope is limited to this app's own folder
// (the app was created with "App folder" access), so the token can't touch
// the rest of the user's Dropbox.
//
// We use the "App folder" so every path here is relative to /Apps/Dash-Andra/.
// From Dash's perspective the layout mirrors the old iCloud one:
//   /data/log-<device>.jsonl
//   /data/snapshot.json
//   /assets/<hash>.<ext>

const CONTENT = "https://content.dropboxapi.com/2";
const RPC = "https://api.dropboxapi.com/2";

export class Dropbox {
  // tokenSource can be either a plain string (legacy manual token) or an async
  // function returning a current access token (the auto-refreshing flow).
  constructor(tokenSource) { this.tokenSource = tokenSource; }

  get hasToken() { return !!this.tokenSource; }

  async _token() {
    return typeof this.tokenSource === "function" ? await this.tokenSource() : this.tokenSource;
  }

  async _headers(extra = {}) {
    const token = await this._token();
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  // Verify the token works and has folder access. Returns {ok, account} or throws.
  async check() {
    const res = await fetch(`${RPC}/users/get_current_account`, {
      method: "POST",
      headers: await this._headers(),
    });
    if (res.status === 401) throw new DropboxAuthError("Dropbox token was rejected (401). Generate a fresh token and paste it again.");
    if (!res.ok) throw new Error(`Dropbox check failed (${res.status}).`);
    return { ok: true };
  }

  // Download a text file. Returns string, or null if it doesn't exist yet.
  async downloadText(path) {
    const res = await fetch(`${CONTENT}/files/download`, {
      method: "POST",
      headers: await this._headers({ "Dropbox-API-Arg": JSON.stringify({ path }) }),
    });
    if (res.status === 409) return null;      // path not found — normal on first run
    if (res.status === 401) throw new DropboxAuthError("Dropbox token was rejected.");
    if (!res.ok) throw new Error(`Dropbox download failed for ${path} (${res.status}).`);
    return await res.text();
  }

  // Download binary (for assets). Returns ArrayBuffer or null.
  async downloadBinary(path) {
    const res = await fetch(`${CONTENT}/files/download`, {
      method: "POST",
      headers: await this._headers({ "Dropbox-API-Arg": JSON.stringify({ path }) }),
    });
    if (res.status === 409) return null;
    if (!res.ok) throw new Error(`Dropbox download failed for ${path} (${res.status}).`);
    return await res.arrayBuffer();
  }

  // Upload/overwrite a file (text or binary). mode "overwrite" for snapshot,
  // "add"/"overwrite" fine for logs since each device owns its own log file.
  async upload(path, body, { mode = "overwrite" } = {}) {
    const res = await fetch(`${CONTENT}/files/upload`, {
      method: "POST",
      headers: await this._headers({
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ path, mode, mute: true, autorename: false }),
      }),
      body,
    });
    if (res.status === 401) throw new DropboxAuthError("Dropbox token was rejected.");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Dropbox upload failed for ${path} (${res.status}). ${text.slice(0, 200)}`);
    }
    return await res.json();
  }

  // List a folder's entries (names + sizes). Returns [] if folder missing.
  async list(path) {
    const out = [];
    let res = await fetch(`${RPC}/files/list_folder`, {
      method: "POST",
      headers: await this._headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path, recursive: false }),
    });
    if (res.status === 409) return []; // folder doesn't exist yet
    if (res.status === 401) throw new DropboxAuthError("Dropbox token was rejected.");
    if (!res.ok) throw new Error(`Dropbox list failed for ${path} (${res.status}).`);
    let data = await res.json();
    out.push(...data.entries);
    // paginate if needed (won't happen at small scale, but correct anyway)
    while (data.has_more) {
      res = await fetch(`${RPC}/files/list_folder/continue`, {
        method: "POST",
        headers: await this._headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ cursor: data.cursor }),
      });
      if (!res.ok) break;
      data = await res.json();
      out.push(...data.entries);
    }
    return out.map(e => ({ name: e.name, size: e.size, path_lower: e.path_lower, tag: e[".tag"] }));
  }
}

// Distinct error type so the UI can prompt for a fresh token specifically
// (vs. a generic network hiccup).
export class DropboxAuthError extends Error {
  constructor(msg) { super(msg); this.name = "DropboxAuthError"; }
}
