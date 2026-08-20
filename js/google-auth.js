// Google sign-in for the static GitHub Pages build.
(() => {
  "use strict";

  if (window.TexasHoldemAuth?.version) return;

  const CONFIG = Object.freeze({
    projectUrl: "https://iphhyjutbrahvfnsvdfn.supabase.co",
    publishableKey: "sb_publishable_MbNQVDLJkB-_1Z05aQ1FRA_V3XCNfMx",
    clientModuleUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm",
    identityStorageKey: "texasHoldemPlayerIdentityV1",
  });
  const DEFAULT_PLAYER_NAME = "Owl";
  const MAX_NAME_LENGTH = 24;

  let clientPromise = null;
  let authSubscription = null;
  let session = null;
  let cachedIdentity = readCachedIdentity();
  let authError = readAuthErrorFromUrl();
  let loading = false;
  let mountTimer = null;

  function cleanText(value, maxLength = 160) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function cleanPlayerName(value) {
    return cleanText(value, 160)
      .replace(/<[^>]*>/g, "")
      .replace(/[<>]/g, "")
      .trim()
      .slice(0, MAX_NAME_LENGTH);
  }

  function safeAvatarUrl(value) {
    const raw = cleanText(value, 500);
    if (!raw) return "";
    try {
      const url = new URL(raw);
      return url.protocol === "https:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function readCachedIdentity() {
    try {
      const value = JSON.parse(localStorage.getItem(CONFIG.identityStorageKey) || "null");
      const name = cleanPlayerName(value?.name);
      if (!name) return null;
      return {
        userId: cleanText(value.userId, 80),
        name,
        email: cleanText(value.email),
        avatarUrl: safeAvatarUrl(value.avatarUrl),
      };
    } catch (error) {
      return null;
    }
  }

  function saveCachedIdentity(identity) {
    cachedIdentity = identity;
    try {
      if (identity) localStorage.setItem(CONFIG.identityStorageKey, JSON.stringify(identity));
      else localStorage.removeItem(CONFIG.identityStorageKey);
    } catch (error) {
      // The active session can continue when browser storage is unavailable.
    }
  }

  function readAuthErrorFromUrl() {
    try {
      const query = new URLSearchParams(location.search);
      const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
      return cleanText(
        query.get("error_description") || hash.get("error_description") ||
        query.get("error") || hash.get("error"),
        180,
      );
    } catch (error) {
      return "";
    }
  }

  function hasAuthCallbackParameters() {
    return /(?:access_token|refresh_token|provider_token|error_description|[?&#]code=)/
      .test(`${location.search}&${location.hash}`);
  }

  function cleanCallbackUrl() {
    if (!history?.replaceState) return;
    history.replaceState({}, document.title, `${location.origin}${location.pathname}`);
  }

  function identityFromSession(nextSession) {
    const user = nextSession?.user;
    if (!user) return null;
    const metadata = user.user_metadata || {};
    const email = cleanText(user.email || metadata.email);
    const emailName = email.includes("@") ? email.split("@")[0] : DEFAULT_PLAYER_NAME;
    return {
      userId: cleanText(user.id, 80),
      name: cleanPlayerName(
        metadata.full_name || metadata.name || metadata.preferred_username || emailName,
      ) || DEFAULT_PLAYER_NAME,
      email,
      avatarUrl: safeAvatarUrl(metadata.avatar_url || metadata.picture),
    };
  }

  function currentIdentity() {
    return identityFromSession(session) || cachedIdentity;
  }

  function playerName() {
    return currentIdentity()?.name || DEFAULT_PLAYER_NAME;
  }

  function installStylesheet() {
    if (document.querySelector('link[data-google-auth-style]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "js/google-auth.css?v=google-auth-v1.1";
    link.dataset.googleAuthStyle = "true";
    document.head.appendChild(link);
  }

  function createAccountButton() {
    const button = document.createElement("button");
    button.id = "authAccountButton";
    button.type = "button";
    button.className = "ghost-button topbar-settings-item auth-account-button";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", "authAccountOverlay");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = `
      <span class="auth-account-avatar" aria-hidden="true"><img alt="" hidden /><span>👤</span></span>
      <span class="auth-account-label">玩家登入</span>`;
    button.addEventListener("click", openAccount);
    return button;
  }

  function createAccountOverlay() {
    const overlay = document.createElement("section");
    overlay.id = "authAccountOverlay";
    overlay.className = "auth-account-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "玩家帳號");
    overlay.innerHTML = `
      <div class="auth-account-modal">
        <header class="auth-account-head">
          <div><p class="eyebrow">Player Account</p><h2>玩家帳號</h2></div>
          <button id="authAccountClose" class="ghost-button auth-account-close" type="button" aria-label="關閉玩家帳號">×</button>
        </header>
        <section id="authSignedOutView" class="auth-signed-out-view">
          <p>使用 Google 登入後，可以在不同裝置辨識同一位玩家，並為淘汰賽雲端存檔與真人連線做準備。</p>
          <button id="googleSignInButton" class="google-sign-in-button" type="button"><span aria-hidden="true">G</span> 使用 Google 登入</button>
        </section>
        <section id="authSignedInView" class="auth-signed-in-view" hidden>
          <div class="auth-profile-card">
            <span class="auth-profile-avatar" aria-hidden="true"><img id="authProfileAvatar" alt="" hidden /><span>🦉</span></span>
            <div><strong id="authProfileName">玩家</strong><span id="authProfileEmail"></span></div>
          </div>
          <button id="googleSignOutButton" class="ghost-button auth-sign-out-button" type="button">登出這台裝置</button>
        </section>
        <p id="authAccountStatus" class="auth-account-status" aria-live="polite"></p>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#authAccountClose")?.addEventListener("click", closeAccount);
    overlay.querySelector("#googleSignInButton")?.addEventListener("click", signInWithGoogle);
    overlay.querySelector("#googleSignOutButton")?.addEventListener("click", signOut);
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeAccount();
    });
    return overlay;
  }

  function ensureUi() {
    const panel = document.querySelector("#settingsMenuPanel");
    let button = document.querySelector("#authAccountButton");
    if (!button && panel) {
      button = createAccountButton();
      panel.appendChild(button);
    }
    let overlay = document.querySelector("#authAccountOverlay");
    if (!overlay) overlay = createAccountOverlay();
    return { button, overlay, mounted: Boolean(button && panel) };
  }

  function scheduleMount() {
    const result = ensureUi();
    if (result.mounted) {
      if (mountTimer) clearInterval(mountTimer);
      mountTimer = null;
      renderAuthUi();
      return;
    }
    if (!mountTimer) {
      mountTimer = window.setInterval(() => {
        if (ensureUi().mounted) {
          clearInterval(mountTimer);
          mountTimer = null;
          renderAuthUi();
        }
      }, 100);
    }
  }

  function setAvatar(shell, identity) {
    const image = shell?.querySelector("img");
    const fallback = shell?.querySelector("span");
    if (!image || !fallback) return;
    if (identity?.avatarUrl) {
      image.src = identity.avatarUrl;
      image.hidden = false;
      fallback.hidden = true;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
      fallback.hidden = false;
    }
  }

  function renderAuthUi() {
    const { button } = ensureUi();
    const identity = currentIdentity();
    const signedIn = Boolean(identity && (session?.user || cachedIdentity));
    if (button) {
      button.dataset.authState = signedIn ? "signed-in" : "signed-out";
      button.querySelector(".auth-account-label").textContent = signedIn ? identity.name : "玩家登入";
      setAvatar(button.querySelector(".auth-account-avatar"), signedIn ? identity : null);
    }

    const signedOutView = document.querySelector("#authSignedOutView");
    const signedInView = document.querySelector("#authSignedInView");
    if (signedOutView) signedOutView.hidden = signedIn;
    if (signedInView) signedInView.hidden = !signedIn;
    const profileName = document.querySelector("#authProfileName");
    const profileEmail = document.querySelector("#authProfileEmail");
    if (profileName) profileName.textContent = identity?.name || DEFAULT_PLAYER_NAME;
    if (profileEmail) profileEmail.textContent = identity?.email || "";
    setAvatar(document.querySelector(".auth-profile-avatar"), signedIn ? identity : null);

    const statusNode = document.querySelector("#authAccountStatus");
    if (statusNode) {
      let text = signedIn ? "已使用 Google 登入。" : "尚未登入。";
      let tone = signedIn ? "success" : "neutral";
      if (loading) {
        text = "正在連接登入服務…";
        tone = "pending";
      } else if (authError) {
        text = `登入失敗：${authError}`;
        tone = "error";
      }
      statusNode.textContent = text;
      statusNode.dataset.tone = tone;
    }
    document.querySelectorAll("#googleSignInButton, #googleSignOutButton").forEach(control => {
      control.disabled = loading;
    });
  }

  function applyIdentityToGame() {
    const name = playerName();
    try {
      if (typeof state !== "undefined" && state.players?.[0]) state.players[0].name = name;
      if (typeof render === "function" && typeof state !== "undefined" && state.players?.length) render();
      else {
        const node = document.querySelector("#playerName");
        if (node) node.textContent = name;
      }
    } catch (error) {
      // Account presentation must never interrupt the game loop.
    }
  }

  function wrapStartHand() {
    const original = window.startHand;
    if (typeof original !== "function" || original.googleAuthIdentityWrapped) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      applyIdentityToGame();
      return result;
    };
    wrapped.googleAuthIdentityWrapped = true;
    window.startHand = wrapped;
  }

  function updateSession(nextSession, event = "") {
    session = nextSession || null;
    const identity = identityFromSession(session);
    if (identity) {
      saveCachedIdentity(identity);
      authError = "";
      cleanCallbackUrl();
    } else if (["SIGNED_OUT", "USER_DELETED", "INITIAL_SESSION"].includes(event)) {
      saveCachedIdentity(null);
    }
    applyIdentityToGame();
    renderAuthUi();
  }

  async function createAuthClient() {
    if (window.__SUPABASE_AUTH_TEST_CLIENT__) return window.__SUPABASE_AUTH_TEST_CLIENT__;
    const module = await import(CONFIG.clientModuleUrl);
    if (typeof module.createClient !== "function") throw new Error("登入模組載入失敗");
    return module.createClient(CONFIG.projectUrl, CONFIG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  async function ensureClient() {
    if (!clientPromise) {
      clientPromise = createAuthClient().then(client => {
        if (!authSubscription) {
          const result = client.auth.onAuthStateChange((event, nextSession) => updateSession(nextSession, event));
          authSubscription = result?.data?.subscription || result || true;
        }
        return client;
      }).catch(error => {
        clientPromise = null;
        throw error;
      });
    }
    return clientPromise;
  }

  async function initializeAuth() {
    if (!cachedIdentity && !hasAuthCallbackParameters()) {
      renderAuthUi();
      applyIdentityToGame();
      return null;
    }
    loading = true;
    renderAuthUi();
    try {
      const client = await ensureClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      updateSession(data?.session || null, "INITIAL_SESSION");
      return data?.session || null;
    } catch (error) {
      authError = cleanText(error?.message || error, 180) || "登入服務暫時無法使用";
      cleanCallbackUrl();
      return null;
    } finally {
      loading = false;
      renderAuthUi();
    }
  }

  async function signInWithGoogle() {
    loading = true;
    authError = "";
    renderAuthUi();
    try {
      const client = await ensureClient();
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}${location.pathname}`,
          scopes: "openid email profile",
        },
      });
      if (error) throw error;
    } catch (error) {
      authError = cleanText(error?.message || error, 180) || "無法開始 Google 登入";
    } finally {
      loading = false;
      renderAuthUi();
    }
  }

  async function signOut() {
    loading = true;
    authError = "";
    renderAuthUi();
    try {
      const client = await ensureClient();
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      updateSession(null, "SIGNED_OUT");
    } catch (error) {
      authError = cleanText(error?.message || error, 180) || "登出失敗";
    } finally {
      loading = false;
      renderAuthUi();
    }
  }

  function openAccount() {
    const { button, overlay } = ensureUi();
    overlay.hidden = false;
    button?.setAttribute("aria-expanded", "true");
    renderAuthUi();
    window.setTimeout(() => overlay.querySelector("button:not(:disabled)")?.focus(), 0);
  }

  function closeAccount() {
    const overlay = document.querySelector("#authAccountOverlay");
    const button = document.querySelector("#authAccountButton");
    if (overlay) overlay.hidden = true;
    button?.setAttribute("aria-expanded", "false");
    document.querySelector("#settingsMenuButton")?.focus();
  }

  function status() {
    const identity = currentIdentity();
    return {
      configured: true,
      signedIn: Boolean(session?.user),
      cached: Boolean(cachedIdentity),
      loading,
      name: identity?.name || DEFAULT_PLAYER_NAME,
      email: identity?.email || "",
      projectRef: "iphhyjutbrahvfnsvdfn",
      lastError: authError,
    };
  }

  installStylesheet();
  scheduleMount();
  wrapStartHand();
  window.setTimeout(wrapStartHand, 0);
  window.setTimeout(wrapStartHand, 500);
  renderAuthUi();
  initializeAuth();

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.querySelector("#authAccountOverlay")?.hidden) closeAccount();
  });

  window.TexasHoldemAuth = {
    version: "1.1.0",
    status,
    playerName,
    signInWithGoogle,
    signOut,
    openAccount,
    closeAccount,
    refresh: initializeAuth,
  };
})();