// Google sign-in for the static GitHub Pages build.
(() => {
  "use strict";

  if (window.TexasHoldemAuth?.version) return;

  const CONFIG = Object.freeze({
    projectUrl: "https://iphhyjutbrahvfnsvdfn.supabase.co",
    publishableKey: "sb_publishable_MbNQVDLJkB-_1Z05aQ1FRA_V3XCNfMx",
    clientModuleUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
    identityStorageKey: "texasHoldemPlayerIdentityV1",
  });
  const DEFAULT_PLAYER_NAME = "Owl";
  const MAX_PLAYER_NAME_LENGTH = 24;

  let clientPromise = null;
  let authSubscription = null;
  let session = null;
  let cachedIdentity = readCachedIdentity();
  let authError = readAuthErrorFromUrl();
  let loading = false;
  let modalRestoreTarget = null;

  function normalizeText(value, maxLength = 120) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function safeAvatarUrl(value) {
    const raw = normalizeText(value, 500);
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
      const parsed = JSON.parse(localStorage.getItem(CONFIG.identityStorageKey) || "null");
      if (!parsed || typeof parsed !== "object") return null;
      const name = normalizeText(parsed.name, MAX_PLAYER_NAME_LENGTH);
      if (!name) return null;
      return {
        userId: normalizeText(parsed.userId, 80),
        name,
        email: normalizeText(parsed.email, 160),
        avatarUrl: safeAvatarUrl(parsed.avatarUrl),
      };
    } catch (error) {
      return null;
    }
  }

  function persistIdentity(identity) {
    cachedIdentity = identity;
    try {
      if (identity) localStorage.setItem(CONFIG.identityStorageKey, JSON.stringify(identity));
      else localStorage.removeItem(CONFIG.identityStorageKey);
    } catch (error) {
      // Authentication continues even when browser storage is unavailable.
    }
  }

  function readAuthErrorFromUrl() {
    try {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      return normalizeText(
        query.get("error_description") || hash.get("error_description") || query.get("error") || hash.get("error"),
        180,
      );
    } catch (error) {
      return "";
    }
  }

  function hasAuthCallbackParameters() {
    const combined = `${window.location.search}&${window.location.hash}`;
    return /(?:access_token|refresh_token|provider_token|error_description|[?&#]code=)/.test(combined);
  }

  function cleanAuthErrorFromUrl() {
    if (!authError || !window.history?.replaceState) return;
    const clean = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, clean);
  }

  function identityFromSession(nextSession) {
    const user = nextSession?.user;
    if (!user) return null;
    const metadata = user.user_metadata || {};
    const email = normalizeText(user.email || metadata.email, 160);
    const fallback = email.includes("@") ? email.split("@")[0] : DEFAULT_PLAYER_NAME;
    const name = normalizeText(
      metadata.full_name || metadata.name || metadata.preferred_username || fallback,
      MAX_PLAYER_NAME_LENGTH,
    ) || DEFAULT_PLAYER_NAME;
    return {
      userId: normalizeText(user.id, 80),
      name,
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

  function canonicalRedirectUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function installStylesheet() {
    if (document.querySelector('link[data-google-auth-style]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "js/google-auth.css?v=google-auth-v1";
    link.dataset.googleAuthStyle = "true";
    document.head.appendChild(link);
  }

  function ensureUi() {
    let button = document.querySelector("#authAccountButton");
    if (!button) {
      button = document.createElement("button");
      button.id = "authAccountButton";
      button.type = "button";
      button.className = "ghost-button tool-button auth-account-button";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", "authAccountOverlay");
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = `
        <span class="auth-account-avatar" aria-hidden="true"><img alt="" hidden /><span>👤</span></span>
        <span class="auth-account-label">登入</span>`;
      button.addEventListener("click", openAccount);
      const actions = document.querySelector(".top-bar-actions");
      const anchor = actions?.querySelector("#muteButton") || actions?.firstElementChild || null;
      actions?.insertBefore(button, anchor);
    }

    let overlay = document.querySelector("#authAccountOverlay");
    if (!overlay) {
      overlay = document.createElement("section");
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
            <button id="googleSignInButton" class="google-sign-in-button" type="button">
              <span aria-hidden="true">G</span> 使用 Google 登入
            </button>
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
    }

    return { button, overlay };
  }

  function setAvatar(container, image, fallback, identity) {
    if (!container || !image || !fallback) return;
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
    const label = button?.querySelector(".auth-account-label");
    const avatarShell = button?.querySelector(".auth-account-avatar");
    const avatarImage = avatarShell?.querySelector("img");
    const avatarFallback = avatarShell?.querySelector("span");

    if (button) button.dataset.authState = signedIn ? "signed-in" : "signed-out";
    if (label) label.textContent = signedIn ? identity.name : "登入";
    setAvatar(avatarShell, avatarImage, avatarFallback, signedIn ? identity : null);

    const signedOutView = document.querySelector("#authSignedOutView");
    const signedInView = document.querySelector("#authSignedInView");
    if (signedOutView) signedOutView.hidden = signedIn;
    if (signedInView) signedInView.hidden = !signedIn;

    const profileName = document.querySelector("#authProfileName");
    const profileEmail = document.querySelector("#authProfileEmail");
    if (profileName) profileName.textContent = identity?.name || DEFAULT_PLAYER_NAME;
    if (profileEmail) profileEmail.textContent = identity?.email || "";
    const profileImage = document.querySelector("#authProfileAvatar");
    const profileShell = profileImage?.closest(".auth-profile-avatar");
    const profileFallback = profileShell?.querySelector("span");
    setAvatar(profileShell, profileImage, profileFallback, signedIn ? identity : null);

    const status = document.querySelector("#authAccountStatus");
    if (status) {
      let message = signedIn ? "已使用 Google 登入。" : "尚未登入。";
      let tone = signedIn ? "success" : "neutral";
      if (loading) {
        message = "正在連接登入服務…";
        tone = "pending";
      } else if (authError) {
        message = `登入失敗：${authError}`;
        tone = "error";
      }
      status.textContent = message;
      status.dataset.tone = tone;
    }

    document.querySelectorAll("#googleSignInButton, #googleSignOutButton").forEach(control => {
      control.disabled = loading;
    });
  }

  function applyIdentityToGame() {
    const name = playerName();
    try {
      if (typeof state !== "undefined" && state.players?.[0]) state.players[0].name = name;
      if (typeof els !== "undefined" && els.playerName) els.playerName.textContent = name;
      else {
        const node = document.querySelector("#playerName");
        if (node) node.textContent = name;
      }
      if (typeof render === "function" && typeof state !== "undefined" && state.players?.length) render();
    } catch (error) {
      // Authentication identity is decorative and must never block the game loop.
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
      persistIdentity(identity);
      authError = "";
      cleanAuthErrorFromUrl();
    } else if (["SIGNED_OUT", "USER_DELETED"].includes(event) || event === "INITIAL_SESSION") {
      persistIdentity(null);
    }
    applyIdentityToGame();
    renderAuthUi();
  }

  async function createAuthClient() {
    if (window.__SUPABASE_AUTH_TEST_CLIENT__) return window.__SUPABASE_AUTH_TEST_CLIENT__;
    const module = await import(CONFIG.clientModuleUrl);
    if (typeof module.createClient !== "function") throw new Error("登入模組載入失敗");
    return module.createClient(CONFIG.projectUrl, CONFIG.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  async function ensureClient() {
    if (!clientPromise) {
      clientPromise = createAuthClient().then(client => {
        if (!authSubscription) {
          const subscription = client.auth.onAuthStateChange((event, nextSession) => {
            updateSession(nextSession, event);
          });
          authSubscription = subscription?.data?.subscription || subscription || true;
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
      authError = normalizeText(error?.message || error, 180) || "登入服務暫時無法使用";
      cleanAuthErrorFromUrl();
      renderAuthUi();
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
          redirectTo: canonicalRedirectUrl(),
          scopes: "openid email profile",
        },
      });
      if (error) throw error;
    } catch (error) {
      authError = normalizeText(error?.message || error, 180) || "無法開始 Google 登入";
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
      authError = normalizeText(error?.message || error, 180) || "登出失敗";
    } finally {
      loading = false;
      renderAuthUi();
    }
  }

  function openAccount() {
    const { button, overlay } = ensureUi();
    modalRestoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : button;
    overlay.hidden = false;
    button?.setAttribute("aria-expanded", "true");
    renderAuthUi();
    window.setTimeout(() => {
      const target = overlay.querySelector("button:not([hidden]):not(:disabled)");
      target?.focus();
    }, 0);
  }

  function closeAccount() {
    const overlay = document.querySelector("#authAccountOverlay");
    const button = document.querySelector("#authAccountButton");
    if (overlay) overlay.hidden = true;
    button?.setAttribute("aria-expanded", "false");
    modalRestoreTarget?.focus?.();
    modalRestoreTarget = null;
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
  ensureUi();
  wrapStartHand();
  renderAuthUi();
  initializeAuth();

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.querySelector("#authAccountOverlay")?.hidden) closeAccount();
  });

  window.TexasHoldemAuth = {
    version: "1.0.0",
    status,
    playerName,
    signInWithGoogle,
    signOut,
    openAccount,
    closeAccount,
    refresh: initializeAuth,
  };
})();
