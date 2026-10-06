// ---- Dropbox-synk ----
// Oppføringene speiles til Apps/ninetofiveish/entries.json i brukerens Dropbox.
// localStorage er fortsatt lokal kopi, så appen virker offline.

const DROPBOX_APP_KEY = "oqqwk7cbv1ytb8m";
const TOKEN_KEY = "ninetofiveish-dropbox";
const VERIFIER_KEY = "ninetofiveish-dropbox-verifier";
const FILE_PATH = "/entries.json";

let syncing = false;
let syncAgain = false;
let syncTimer = null;

function getTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY));
  } catch {
    return null;
  }
}
function setTokens(t) {
  if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  else localStorage.removeItem(TOKEN_KEY);
}
function isConnected() {
  return !!getTokens()?.refresh_token;
}

function setStatus(text) {
  document.getElementById("syncStatus").textContent = text;
}
function updateSyncButton() {
  document.getElementById("syncConnectBtn").textContent = isConnected()
    ? "Koble fra Dropbox"
    : "Koble til Dropbox";
}

// ---- Innlogging (OAuth PKCE, kode limes inn manuelt) ----

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Lenken lages på forhånd: Safari blokkerer window.open som skjer etter en
// await, så selve trykket må åpne Dropbox synkront.
let authUrl = null;

async function prepareAuthUrl() {
  // Gjenbruk eksisterende verifier: iOS kan starte PWA-en på nytt mens man
  // henter koden i Safari, og koden må passe med verifieren den ble laget for
  const verifier =
    localStorage.getItem(VERIFIER_KEY) ||
    base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  localStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
  });
  authUrl = `https://www.dropbox.com/oauth2/authorize?${params}`;
  document.getElementById("syncAuthLink").href = authUrl;
}

function startConnect() {
  if (!DROPBOX_APP_KEY) {
    alert("DROPBOX_APP_KEY mangler i sync.js.");
    return;
  }
  if (authUrl) window.open(authUrl, "_blank");
  else prepareAuthUrl();
  // Lenken i boksen er reserve hvis vinduet ble blokkert
  document.getElementById("syncConnect").hidden = false;
}

async function finishConnect(code) {
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: DROPBOX_APP_KEY,
      code_verifier: localStorage.getItem(VERIFIER_KEY) || "",
    }),
  });
  if (!res.ok) throw new Error("Koden ble ikke godtatt");
  const data = await res.json();
  setTokens({
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
  localStorage.removeItem(VERIFIER_KEY);
}

async function disconnect() {
  const tokens = getTokens();
  setTokens(null);
  updateSyncButton();
  setStatus("Dropbox: ikke tilkoblet");
  prepareAuthUrl();
  try {
    await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
  } catch {}
}

async function getAccessToken() {
  const tokens = getTokens();
  if (tokens.access_token && Date.now() < tokens.expires_at) {
    return tokens.access_token;
  }
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: DROPBOX_APP_KEY,
    }),
  });
  if (res.status === 400 || res.status === 401) {
    // Tilgangen er trukket tilbake – lokale data røres ikke
    setTokens(null);
    throw new Error("Dropbox-tilgangen er utløpt, koble til på nytt");
  }
  if (!res.ok) throw await apiError("token", res);
  const data = await res.json();
  setTokens({
    ...tokens,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
  return data.access_token;
}

// Dropbox forklarer feilen i svaret – ta den med i meldingen
async function apiError(what, res) {
  const text = await res.text().catch(() => "");
  return new Error(`${what} ${res.status}: ${text.slice(0, 200)}`);
}

// ---- Filoperasjoner ----

async function downloadRemote(token) {
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path: FILE_PATH }),
    },
  });
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}));
    if (err.error_summary?.startsWith("path/not_found")) {
      return { entries: [], rev: null };
    }
    throw new Error(err.error_summary || "nedlasting feilet");
  }
  if (!res.ok) throw await apiError("nedlasting", res);
  const meta = JSON.parse(res.headers.get("dropbox-api-result"));
  const body = await res.json();
  return { entries: body.entries || [], rev: meta.rev };
}

// Returnerer false ved konflikt (noen andre har skrevet filen siden vi leste den)
async function uploadRemote(token, list, rev) {
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: FILE_PATH,
        mode: rev ? { ".tag": "update", update: rev } : "add",
        mute: true,
      }),
    },
    body: JSON.stringify({ version: 1, entries: list }, null, 1),
  });
  if (res.status === 409) return false;
  if (!res.ok) throw await apiError("opplasting", res);
  return true;
}

function sameEntries(a, b) {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((e) => [e.id, e.updatedAt || 0]));
  return b.every((e) => byId.get(e.id) === (e.updatedAt || 0));
}

// ---- Synk ----

async function sync() {
  if (!isConnected()) return;
  if (syncing) {
    syncAgain = true;
    return;
  }
  syncing = true;
  setStatus("Dropbox: synker…");
  try {
    const token = await getAccessToken();
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await downloadRemote(token);
      const merged = mergeEntries(entries, remote.entries);
      if (!sameEntries(merged, entries)) applyRemote(merged);
      if (sameEntries(merged, remote.entries) && remote.rev) break;
      if (await uploadRemote(token, merged, remote.rev)) break;
      if (attempt === 2) throw new Error("konflikt, prøver igjen senere");
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    setStatus(`Dropbox: synket ${hh}:${mm}`);
  } catch (e) {
    console.error("Synk feilet:", e);
    setStatus(
      navigator.onLine
        ? `Dropbox: feil – ${e.message}`
        : "Dropbox: offline – synker senere",
    );
  } finally {
    syncing = false;
    updateSyncButton();
    if (syncAgain) {
      syncAgain = false;
      sync();
    }
  }
}

function applyRemote(merged) {
  entries = merged;
  saveLocal();
  // Ikke tegn på nytt midt i redigering – da forsvinner det brukeren skriver
  if (editingNoteId === null) render();
  const batchView = document.getElementById("batchView");
  if (
    batchView.style.display !== "none" &&
    !batchView.contains(document.activeElement)
  ) {
    renderBatch();
  }
}

function scheduleSync() {
  if (!isConnected()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 1500);
}

function initSync() {
  document.getElementById("syncConnectBtn").addEventListener("click", () => {
    if (isConnected()) {
      const msg =
        "Koble fra Dropbox? Dataene blir liggende både her og i Dropbox.";
      if (confirm(msg)) disconnect();
    } else {
      startConnect();
    }
  });
  document.getElementById("syncCodeBtn").addEventListener("click", async () => {
    const code = document.getElementById("syncCode").value.trim();
    if (!code) return;
    try {
      await finishConnect(code);
      document.getElementById("syncConnect").hidden = true;
      document.getElementById("syncCode").value = "";
      updateSyncButton();
      sync();
    } catch (e) {
      alert(e.message);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync();
  });
  window.addEventListener("online", sync);

  updateSyncButton();
  if (isConnected()) sync();
  else {
    setStatus("Dropbox: ikke tilkoblet");
    prepareAuthUrl();
  }
}
