// Player-owned display profile for guest and Google-authenticated sessions.
(() => {
  "use strict";

  if (window.TexasHoldemPlayerProfile?.version) return;

  const CONFIG = Object.freeze({
    projectUrl: "https://iphhyjutbrahvfnsvdfn.supabase.co",
    publishableKey: "sb_publishable_MbNQVDLJkB-_1Z05aQ1FRA_V3XCNfMx",
    clientModuleUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm",
    table: "player_profiles",
    bucket: "player-avatars",
    guestStorageKey: "texasHoldemGuestProfileV1",
    styleUrl: "js/player-profile-v1.css?v=runtime-20260821-r1",
    maxNameLength: 24,
    maxSourceBytes: 8 * 1024 * 1024,
    maxStoredAvatarBytes: 1024 * 1024,
    avatarSize: 256,
    authPollMs: 250,
  });

  const DEFAULT_NAME = "Owl";
  const PRESETS = Object.freeze({
    owl: "🦉",
    fox: "🦊",
    wolf: "🐺",
    tiger: "🐯",
    panda: "🐼",
    robot: "🤖",
  });
  const AVATAR_KINDS = new Set(["preset", "provider", "custom"]);
  const ALLOWED_SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

  let clientPromise = null;
  let activeProfile = null;
  let activeSource = "guest";
  let guestProfile = readGuestProfile();
  let lastAuthUserId = "";
  let syncing = false;
  let lastError = "";
  let authTimer = null;
  let mountTimer = null;
  let nameObserver = null;
  let draftProfile = null;
  let draftAvatarBlob = null;
  let draftNameTouched = false;
  let draftAvatarTouched = false;
  let currentProviderProfile = null;

  function cleanText(value, maxLength = 160) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function cleanName(value) {
    return cleanText(value, 160)
      .replace(/<[^>]*>/g, "")
      .replace(/[<>]/g, "")
      .trim()
      .slice(0, CONFIG.maxNameLength);
  }

  function safeHttpsUrl(value) {
    const raw = cleanText(value, 2048);
    if (!raw) return "";
    try {
      const url = new URL(raw);
      return url.protocol === "https:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function safeDataAvatar(value) {
    const raw = String(value || "");
    if (raw.length > 1_500_000) return "";
    return /^data:image\/(?:webp|jpeg|png);base64,[a-z0-9+/=]+$/i.test(raw) ? raw : "";
  }

  function presetKey(value) {
    const key = cleanText(value, 24);
    return Object.prototype.hasOwnProperty.call(PRESETS, key) ? key : "owl";
  }

  function defaultGuestProfile() {
    return {
      displayName: DEFAULT_NAME,
      avatarKind: "preset",
      avatarValue: "owl",
      nameCustomized: false,
      avatarCustomized: false,
    };
  }

  function normalizeGuest(raw) {
    const fallback = defaultGuestProfile();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
    const kind = AVATAR_KINDS.has(raw.avatarKind) ? raw.avatarKind : fallback.avatarKind;
    let value = "";
    if (kind === "preset") value = presetKey(raw.avatarValue);
    if (kind === "provider") value = safeHttpsUrl(raw.avatarValue);
    if (kind === "custom") value = safeDataAvatar(raw.avatarValue) || safeHttpsUrl(raw.avatarValue);
    if (!value) {
      value = fallback.avatarValue;
      return {
        ...fallback,
        displayName: cleanName(raw.displayName) || fallback.displayName,
        nameCustomized: raw.nameCustomized === true,
      };
    }
    return {
      displayName: cleanName(raw.displayName) || fallback.displayName,
      avatarKind: kind,
      avatarValue: value,
      nameCustomized: raw.nameCustomized === true,
      avatarCustomized: raw.avatarCustomized === true,
    };
  }

  function normalizeCloud(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const displayName = cleanName(raw.display_name ?? raw.displayName);
    const kind = AVATAR_KINDS.has(raw.avatar_kind ?? raw.avatarKind)
      ? (raw.avatar_kind ?? raw.avatarKind)
      : "preset";
    let value = "";
    const rawValue = raw.avatar_value ?? raw.avatarValue;
    if (kind === "preset") value = presetKey(rawValue);
    if (kind === "provider" || kind === "custom") value = safeHttpsUrl(rawValue);
    if (!displayName) return null;
    if (!value) return { displayName, avatarKind: "preset", avatarValue: "owl" };
    return { displayName, avatarKind: kind, avatarValue: value };
  }

  function readGuestProfile() {
    try {
      return normalizeGuest(JSON.parse(localStorage.getItem(CONFIG.guestStorageKey) || "null"));
    } catch (_) {
      return defaultGuestProfile();
    }
  }

  function saveGuestProfile(profile) {
    guestProfile = normalizeGuest(profile);
    try {
      localStorage.setItem(CONFIG.guestStorageKey, JSON.stringify(guestProfile));
    } catch (_) {
      // Guest profile remains usable for the active tab when storage is blocked.
    }
    return guestProfile;
  }

  function providerProfileFromUser(user) {
    const metadata = user?.user_metadata || {};
    const email = cleanText(user?.email || metadata.email);
    const emailName = email.includes("@") ? email.split("@")[0] : DEFAULT_NAME;
    const displayName = cleanName(
      metadata.full_name || metadata.name || metadata.preferred_username || emailName,
    ) || DEFAULT_NAME;
    const avatarUrl = safeHttpsUrl(metadata.avatar_url || metadata.picture);
    return {
      displayName,
      avatarKind: avatarUrl ? "provider" : "preset",
      avatarValue: avatarUrl || "owl",
      email,
    };
  }

  function installStylesheet() {
    if (document.querySelector('link[data-player-profile-style]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CONFIG.styleUrl;
    link.dataset.playerProfileStyle = "true";
    document.head.appendChild(link);
  }

  function avatarMarkup(idPrefix) {
    return `<span class="player-profile-avatar" data-profile-avatar-shell="${idPrefix}" aria-hidden="true"><img alt="" hidden /><span class="player-profile-avatar-fallback">${PRESETS.owl}</span></span>`;
  }

  function createHeroButton() {
    const button = document.createElement("button");
    button.id = "playerProfileButton";
    button.className = "player-profile-hero-button";
    button.type = "button";
    button.title = "編輯玩家名稱與大頭貼";
    button.setAttribute("aria-label", "編輯玩家名稱與大頭貼");
    button.innerHTML = `${avatarMarkup("hero")}<span class="player-profile-edit-badge" aria-hidden="true">✎</span>`;
    button.addEventListener("click", openEditor);
    return button;
  }

  function createOverlay() {
    const overlay = document.createElement("section");
    overlay.id = "playerProfileOverlay";
    overlay.className = "player-profile-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "playerProfileTitle");
    overlay.innerHTML = `
      <div class="player-profile-modal">
        <header class="player-profile-head">
          <div><p class="eyebrow">Player Profile</p><h2 id="playerProfileTitle">玩家個人資料</h2></div>
          <button id="playerProfileClose" class="ghost-button player-profile-close" type="button" aria-label="關閉玩家個人資料">×</button>
        </header>
        <div class="player-profile-preview-row">
          ${avatarMarkup("editor")}
          <div>
            <strong id="playerProfilePreviewName">${DEFAULT_NAME}</strong>
            <span id="playerProfileBindingState">遊客模式</span>
          </div>
        </div>
        <label class="player-profile-name-field">
          <span>牌桌名稱</span>
          <input id="playerProfileNameInput" type="text" maxlength="${CONFIG.maxNameLength}" autocomplete="nickname" spellcheck="false" />
          <small>最多 ${CONFIG.maxNameLength} 個字元，只會改你的玩家名稱。</small>
        </label>
        <fieldset class="player-profile-presets">
          <legend>內建大頭貼</legend>
          <div>${Object.entries(PRESETS).map(([key, emoji]) => (
            `<button type="button" data-profile-preset="${key}" aria-label="選擇 ${emoji} 大頭貼">${emoji}</button>`
          )).join("")}</div>
        </fieldset>
        <div class="player-profile-upload-row">
          <input id="playerProfileAvatarInput" type="file" accept="image/png,image/jpeg,image/webp" hidden />
          <button id="playerProfileUploadButton" class="ghost-button" type="button">📷 上傳照片</button>
          <button id="playerProfileProviderAvatarButton" class="ghost-button" type="button" hidden>G 使用 Google 頭像</button>
        </div>
        <p class="player-profile-file-note">照片只取中央正方形並縮成 256×256；遊客存在這台裝置，Google 帳號則同步到你的雲端 profile。</p>
        <div class="player-profile-binding-card">
          <strong id="playerProfileBindingTitle">遊客資料</strong>
          <span id="playerProfileBindingDetail">名稱與頭像只存在這台瀏覽器。</span>
          <button id="playerProfileGoogleBindButton" type="button">使用 Google 登入並同步</button>
          <button id="playerProfileAccountButton" class="ghost-button" type="button" hidden>Google 帳號設定</button>
        </div>
        <p id="playerProfileStatus" class="player-profile-status" aria-live="polite"></p>
        <div class="player-profile-actions">
          <button id="playerProfileCancel" class="ghost-button" type="button">取消</button>
          <button id="playerProfileSave" type="button">儲存個人資料</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#playerProfileClose")?.addEventListener("click", closeEditor);
    overlay.querySelector("#playerProfileCancel")?.addEventListener("click", closeEditor);
    overlay.querySelector("#playerProfileUploadButton")?.addEventListener("click", () => {
      overlay.querySelector("#playerProfileAvatarInput")?.click();
    });
    overlay.querySelector("#playerProfileAvatarInput")?.addEventListener("change", handleAvatarFile);
    overlay.querySelector("#playerProfileNameInput")?.addEventListener("input", event => {
      draftNameTouched = true;
      if (!draftProfile) return;
      draftProfile.displayName = cleanName(event.target.value) || DEFAULT_NAME;
      renderDraft();
    });
    overlay.querySelectorAll("[data-profile-preset]").forEach(button => {
      button.addEventListener("click", () => {
        if (!draftProfile) return;
        draftProfile.avatarKind = "preset";
        draftProfile.avatarValue = presetKey(button.dataset.profilePreset);
        draftAvatarBlob = null;
        draftAvatarTouched = true;
        renderDraft();
      });
    });
    overlay.querySelector("#playerProfileProviderAvatarButton")?.addEventListener("click", () => {
      if (!draftProfile || !currentProviderProfile) return;
      draftProfile.avatarKind = currentProviderProfile.avatarKind;
      draftProfile.avatarValue = currentProviderProfile.avatarValue;
      draftAvatarBlob = null;
      draftAvatarTouched = true;
      renderDraft();
    });
    overlay.querySelector("#playerProfileSave")?.addEventListener("click", () => saveDraft());
    overlay.querySelector("#playerProfileGoogleBindButton")?.addEventListener("click", async () => {
      const saved = await saveDraft({ closeAfter: false });
      if (!saved) return;
      closeEditor();
      await window.TexasHoldemAuth?.signInWithGoogle?.();
    });
    overlay.querySelector("#playerProfileAccountButton")?.addEventListener("click", () => {
      closeEditor();
      window.TexasHoldemAuth?.openAccount?.();
    });
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeEditor();
    });
    return overlay;
  }

  function ensureUi() {
    const panel = document.querySelector(".player-panel");
    let button = document.querySelector("#playerProfileButton");
    if (panel && !button) {
      button = createHeroButton();
      panel.classList.add("player-profile-enabled");
      panel.prepend(button);
    }
    let overlay = document.querySelector("#playerProfileOverlay");
    if (!overlay) overlay = createOverlay();
    return { panel, button, overlay, mounted: Boolean(panel && button && overlay) };
  }

  function scheduleMount() {
    if (ensureUi().mounted) {
      if (mountTimer) window.clearInterval(mountTimer);
      mountTimer = null;
      renderActiveProfile();
      return;
    }
    if (!mountTimer) {
      mountTimer = window.setInterval(() => {
        if (ensureUi().mounted) {
          window.clearInterval(mountTimer);
          mountTimer = null;
          renderActiveProfile();
        }
      }, 100);
    }
  }

  function setAvatar(shell, profile) {
    const image = shell?.querySelector("img");
    const fallback = shell?.querySelector(".player-profile-avatar-fallback");
    if (!image || !fallback) return;
    if (profile?.avatarKind === "preset") {
      image.hidden = true;
      image.removeAttribute("src");
      fallback.hidden = false;
      fallback.textContent = PRESETS[presetKey(profile.avatarValue)];
      return;
    }
    const url = profile?.avatarKind === "custom"
      ? (safeDataAvatar(profile.avatarValue) || safeHttpsUrl(profile.avatarValue))
      : safeHttpsUrl(profile?.avatarValue);
    if (url) {
      image.src = url;
      image.hidden = false;
      fallback.hidden = true;
    } else {
      image.hidden = true;
      image.removeAttribute("src");
      fallback.hidden = false;
      fallback.textContent = PRESETS.owl;
    }
  }

  function applyProfileToGame() {
    const profile = activeProfile || guestProfile;
    if (!profile) return;
    try {
      if (typeof state !== "undefined" && state.players?.[0]) state.players[0].name = profile.displayName;
      const nameNode = document.querySelector("#playerName");
      if (nameNode && nameNode.textContent !== profile.displayName) nameNode.textContent = profile.displayName;
    } catch (_) {
      // Profile presentation must never interrupt the game loop.
    }
  }

  function mirrorProfileIntoAuthUi() {
    if (activeSource !== "cloud" || !activeProfile) return;
    const accountButton = document.querySelector("#authAccountButton");
    const accountLabel = accountButton?.querySelector(".auth-account-label");
    if (accountLabel && accountLabel.textContent !== activeProfile.displayName) {
      accountLabel.textContent = activeProfile.displayName;
    }
    const profileName = document.querySelector("#authProfileName");
    if (profileName && profileName.textContent !== activeProfile.displayName) {
      profileName.textContent = activeProfile.displayName;
    }
  }

  function renderActiveProfile() {
    ensureUi();
    const profile = activeProfile || guestProfile;
    setAvatar(document.querySelector('[data-profile-avatar-shell="hero"]'), profile);
    applyProfileToGame();
    mirrorProfileIntoAuthUi();
  }

  function activateProfile(profile, source) {
    activeProfile = source === "cloud" ? normalizeCloud(profile) : normalizeGuest(profile);
    activeSource = source === "cloud" && activeProfile ? "cloud" : "guest";
    if (!activeProfile) activeProfile = guestProfile;
    renderActiveProfile();
    renderEditorState();
  }

  async function createClient() {
    if (window.__SUPABASE_PLAYER_PROFILE_TEST_CLIENT__) return window.__SUPABASE_PLAYER_PROFILE_TEST_CLIENT__;
    if (
      window.__SUPABASE_AUTH_TEST_CLIENT__
      && typeof window.__SUPABASE_AUTH_TEST_CLIENT__.from === "function"
      && window.__SUPABASE_AUTH_TEST_CLIENT__.storage
    ) return window.__SUPABASE_AUTH_TEST_CLIENT__;
    const module = await import(CONFIG.clientModuleUrl);
    if (typeof module.createClient !== "function") throw new Error("玩家 profile 模組載入失敗");
    return module.createClient(CONFIG.projectUrl, CONFIG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  async function ensureClient() {
    if (!clientPromise) {
      clientPromise = createClient().catch(error => {
        clientPromise = null;
        throw error;
      });
    }
    return clientPromise;
  }

  async function authenticatedContext() {
    const client = await ensureClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const user = data?.session?.user;
    return user?.id ? { client, user } : null;
  }

  function avatarObjectPath(userId) {
    return `${cleanText(userId, 80)}/avatar`;
  }

  async function uploadAvatar(client, userId, blob) {
    if (!(blob instanceof Blob)) throw new Error("沒有可上傳的大頭貼");
    if (blob.size > CONFIG.maxStoredAvatarBytes) throw new Error("處理後的大頭貼仍過大");
    const path = avatarObjectPath(userId);
    const { error } = await client.storage.from(CONFIG.bucket).upload(path, blob, {
      cacheControl: "3600",
      contentType: blob.type || "image/webp",
      upsert: true,
    });
    if (error) throw error;
    const { data } = client.storage.from(CONFIG.bucket).getPublicUrl(path);
    const publicUrl = safeHttpsUrl(data?.publicUrl);
    if (!publicUrl) throw new Error("無法取得大頭貼網址");
    return `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
  }

  async function removeStoredAvatar(client, userId) {
    try {
      await client.storage.from(CONFIG.bucket).remove([avatarObjectPath(userId)]);
    } catch (_) {
      // A missing previous custom avatar is not an error.
    }
  }

  async function upsertCloudProfile(context, profile) {
    const normalized = normalizeCloud({
      display_name: profile.displayName,
      avatar_kind: profile.avatarKind,
      avatar_value: profile.avatarValue,
    });
    if (!normalized) throw new Error("玩家個人資料格式不正確");
    const now = new Date().toISOString();
    const { error } = await context.client.from(CONFIG.table).upsert({
      user_id: context.user.id,
      display_name: normalized.displayName,
      avatar_kind: normalized.avatarKind,
      avatar_value: normalized.avatarValue,
      updated_at: now,
    }, { onConflict: "user_id" });
    if (error) throw error;
    return normalized;
  }

  async function seedCloudProfile(context) {
    currentProviderProfile = providerProfileFromUser(context.user);
    let seed = {
      displayName: guestProfile.nameCustomized ? guestProfile.displayName : currentProviderProfile.displayName,
      avatarKind: guestProfile.avatarCustomized ? guestProfile.avatarKind : currentProviderProfile.avatarKind,
      avatarValue: guestProfile.avatarCustomized ? guestProfile.avatarValue : currentProviderProfile.avatarValue,
    };
    if (seed.avatarKind === "custom" && safeDataAvatar(seed.avatarValue)) {
      const blob = await dataUrlToBlob(seed.avatarValue);
      seed.avatarValue = await uploadAvatar(context.client, context.user.id, blob);
    }
    if (seed.avatarKind === "provider") {
      seed.avatarValue = safeHttpsUrl(seed.avatarValue) || currentProviderProfile.avatarValue;
    }
    return upsertCloudProfile(context, seed);
  }

  async function syncSignedInProfile() {
    if (syncing) return;
    syncing = true;
    lastError = "";
    renderEditorState();
    try {
      const context = await authenticatedContext();
      if (!context) {
        lastAuthUserId = "";
        activateProfile(guestProfile, "guest");
        return;
      }
      currentProviderProfile = providerProfileFromUser(context.user);
      const { data, error } = await context.client
        .from(CONFIG.table)
        .select("display_name,avatar_kind,avatar_value,updated_at")
        .eq("user_id", context.user.id)
        .maybeSingle();
      if (error) throw error;
      const cloud = normalizeCloud(data);
      const resolved = cloud || await seedCloudProfile(context);
      lastAuthUserId = cleanText(context.user.id, 80);
      activateProfile(resolved, "cloud");
    } catch (error) {
      lastError = cleanText(error?.message || error, 180) || "玩家資料同步失敗";
      const authName = cleanName(window.TexasHoldemAuth?.status?.().name);
      activateProfile({
        display_name: authName || DEFAULT_NAME,
        avatar_kind: currentProviderProfile?.avatarKind || "preset",
        avatar_value: currentProviderProfile?.avatarValue || "owl",
      }, "cloud");
    } finally {
      syncing = false;
      renderEditorState();
    }
  }

  async function reconcileAuthState() {
    const auth = window.TexasHoldemAuth?.status?.();
    if (!auth || auth.loading) return;
    if (!auth.signedIn) {
      if (lastAuthUserId || activeSource !== "guest") {
        lastAuthUserId = "";
        currentProviderProfile = null;
        lastError = "";
        activateProfile(guestProfile, "guest");
      } else {
        renderActiveProfile();
      }
      return;
    }
    try {
      const context = await authenticatedContext();
      const userId = cleanText(context?.user?.id, 80);
      if (!userId) return;
      if (userId !== lastAuthUserId || activeSource !== "cloud") await syncSignedInProfile();
      else mirrorProfileIntoAuthUi();
    } catch (error) {
      lastError = cleanText(error?.message || error, 180);
      renderEditorState();
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("無法讀取這張圖片"));
      };
      image.src = url;
    });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("無法處理大頭貼"));
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(value) {
    const response = await fetch(value);
    return response.blob();
  }

  async function normalizeAvatarFile(file) {
    if (!file || !ALLOWED_SOURCE_TYPES.has(file.type)) throw new Error("請選擇 JPG、PNG 或 WebP 圖片");
    if (file.size > CONFIG.maxSourceBytes) throw new Error("原始圖片請小於 8 MB");
    const image = await loadImage(file);
    const canvas = document.createElement("canvas");
    canvas.width = CONFIG.avatarSize;
    canvas.height = CONFIG.avatarSize;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("瀏覽器無法處理圖片");
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
    const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
    context.fillStyle = "#101923";
    context.fillRect(0, 0, CONFIG.avatarSize, CONFIG.avatarSize);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      CONFIG.avatarSize,
      CONFIG.avatarSize,
    );
    let blob = await canvasBlob(canvas, "image/webp", 0.86);
    if (!blob) blob = await canvasBlob(canvas, "image/jpeg", 0.88);
    if (!blob) throw new Error("瀏覽器無法輸出大頭貼");
    if (blob.size > CONFIG.maxStoredAvatarBytes) throw new Error("處理後的大頭貼仍過大");
    return { blob, dataUrl: await blobToDataUrl(blob) };
  }

  async function handleAvatarFile(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if (!file || !draftProfile) return;
    setEditorStatus("正在處理圖片…", "pending");
    try {
      const result = await normalizeAvatarFile(file);
      draftProfile.avatarKind = "custom";
      draftProfile.avatarValue = result.dataUrl;
      draftAvatarBlob = result.blob;
      draftAvatarTouched = true;
      lastError = "";
      renderDraft();
      setEditorStatus("圖片已裁切完成，按儲存套用。", "success");
    } catch (error) {
      setEditorStatus(cleanText(error?.message || error, 180), "error");
    } finally {
      input.value = "";
    }
  }

  function renderDraft() {
    if (!draftProfile) return;
    const nameInput = document.querySelector("#playerProfileNameInput");
    if (nameInput && document.activeElement !== nameInput) nameInput.value = draftProfile.displayName;
    const previewName = document.querySelector("#playerProfilePreviewName");
    if (previewName) previewName.textContent = draftProfile.displayName;
    setAvatar(document.querySelector('[data-profile-avatar-shell="editor"]'), draftProfile);
    document.querySelectorAll("[data-profile-preset]").forEach(button => {
      const selected = draftProfile.avatarKind === "preset"
        && presetKey(draftProfile.avatarValue) === button.dataset.profilePreset;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function setEditorStatus(message, tone = "neutral") {
    const node = document.querySelector("#playerProfileStatus");
    if (!node) return;
    node.textContent = cleanText(message, 220);
    node.dataset.tone = tone;
  }

  function renderEditorState() {
    const overlay = document.querySelector("#playerProfileOverlay");
    if (!overlay) return;
    const signedIn = activeSource === "cloud" && Boolean(window.TexasHoldemAuth?.status?.().signedIn);
    const auth = window.TexasHoldemAuth?.status?.() || {};
    const bindingState = overlay.querySelector("#playerProfileBindingState");
    const bindingTitle = overlay.querySelector("#playerProfileBindingTitle");
    const bindingDetail = overlay.querySelector("#playerProfileBindingDetail");
    const bindButton = overlay.querySelector("#playerProfileGoogleBindButton");
    const accountButton = overlay.querySelector("#playerProfileAccountButton");
    const providerButton = overlay.querySelector("#playerProfileProviderAvatarButton");
    const saveButton = overlay.querySelector("#playerProfileSave");
    if (bindingState) bindingState.textContent = signedIn ? "Google 已綁定" : "遊客模式";
    if (bindingTitle) bindingTitle.textContent = signedIn ? "Google 雲端 profile" : "遊客資料";
    if (bindingDetail) bindingDetail.textContent = signedIn
      ? `已綁定 ${cleanText(auth.email, 80) || "目前 Google 帳號"}；此 profile 可跨裝置同步。`
      : "名稱與頭像只存在這台瀏覽器；登入 Google 後可建立或讀取雲端 profile。";
    if (bindButton) bindButton.hidden = signedIn;
    if (accountButton) accountButton.hidden = !signedIn;
    if (providerButton) providerButton.hidden = !(signedIn && currentProviderProfile?.avatarKind === "provider");
    if (saveButton) saveButton.disabled = syncing;
    if (syncing) setEditorStatus("正在同步玩家個人資料…", "pending");
    else if (lastError) setEditorStatus(`雲端同步提示：${lastError}`, "error");
    else if (!overlay.hidden) setEditorStatus(
      signedIn ? "修改後會同步到這個 Google 帳號。" : "遊客修改只會儲存在這台裝置。",
      signedIn ? "success" : "neutral",
    );
  }

  function openEditor() {
    const { overlay } = ensureUi();
    const profile = activeProfile || guestProfile;
    draftProfile = { ...profile };
    draftAvatarBlob = null;
    draftNameTouched = false;
    draftAvatarTouched = false;
    const nameInput = overlay.querySelector("#playerProfileNameInput");
    if (nameInput) nameInput.value = draftProfile.displayName;
    renderDraft();
    renderEditorState();
    overlay.hidden = false;
    renderEditorState();
    window.setTimeout(() => nameInput?.focus(), 0);
  }

  function closeEditor() {
    const overlay = document.querySelector("#playerProfileOverlay");
    if (overlay) overlay.hidden = true;
    draftProfile = null;
    draftAvatarBlob = null;
    draftNameTouched = false;
    draftAvatarTouched = false;
    document.querySelector("#playerProfileButton")?.focus();
  }

  async function saveDraft({ closeAfter = true } = {}) {
    if (!draftProfile) return false;
    const nameInput = document.querySelector("#playerProfileNameInput");
    const displayName = cleanName(nameInput?.value || draftProfile.displayName);
    if (!displayName) {
      setEditorStatus("請輸入玩家名稱。", "error");
      return false;
    }
    draftProfile.displayName = displayName;
    const signedIn = Boolean(window.TexasHoldemAuth?.status?.().signedIn);
    const saveButton = document.querySelector("#playerProfileSave");
    if (saveButton) saveButton.disabled = true;
    setEditorStatus(signedIn ? "正在同步到 Google profile…" : "正在儲存遊客資料…", "pending");
    try {
      if (!signedIn) {
        const saved = saveGuestProfile({
          ...draftProfile,
          nameCustomized: guestProfile.nameCustomized || draftNameTouched,
          avatarCustomized: guestProfile.avatarCustomized || draftAvatarTouched,
        });
        lastError = "";
        activateProfile(saved, "guest");
        setEditorStatus("遊客個人資料已儲存在這台裝置。", "success");
      } else {
        const context = await authenticatedContext();
        if (!context) throw new Error("Google 工作階段已失效，請重新登入");
        currentProviderProfile = providerProfileFromUser(context.user);
        let cloudDraft = { ...draftProfile };
        if (cloudDraft.avatarKind === "custom" && draftAvatarBlob) {
          cloudDraft.avatarValue = await uploadAvatar(context.client, context.user.id, draftAvatarBlob);
        } else if (cloudDraft.avatarKind === "custom") {
          cloudDraft.avatarValue = safeHttpsUrl(cloudDraft.avatarValue);
          if (!cloudDraft.avatarValue) throw new Error("請重新選擇大頭貼圖片");
        } else {
          await removeStoredAvatar(context.client, context.user.id);
          if (cloudDraft.avatarKind === "provider") {
            cloudDraft.avatarValue = safeHttpsUrl(cloudDraft.avatarValue)
              || currentProviderProfile.avatarValue;
          }
        }
        const saved = await upsertCloudProfile(context, cloudDraft);
        lastAuthUserId = cleanText(context.user.id, 80);
        lastError = "";
        activateProfile(saved, "cloud");
        setEditorStatus("玩家名稱與大頭貼已同步到 Google profile。", "success");
      }
      if (closeAfter) window.setTimeout(closeEditor, 220);
      return true;
    } catch (error) {
      lastError = cleanText(error?.message || error, 180) || "儲存失敗";
      setEditorStatus(`儲存失敗：${lastError}`, "error");
      return false;
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  function installNameObserver() {
    if (nameObserver) return;
    const node = document.querySelector("#playerName");
    if (!node) return;
    nameObserver = new MutationObserver(() => {
      const expected = (activeProfile || guestProfile)?.displayName;
      if (!expected || node.textContent === expected) return;
      applyProfileToGame();
    });
    nameObserver.observe(node, { childList: true, characterData: true, subtree: true });
  }

  function wrapStartHandAfterAuth() {
    const original = window.startHand;
    if (typeof original !== "function" || original.playerProfileIdentityWrapped) return false;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      applyProfileToGame();
      return result;
    };
    wrapped.playerProfileIdentityWrapped = true;
    // Prevent the auth layer's delayed wrapper from being re-applied outside this profile wrapper.
    wrapped.googleAuthIdentityWrapped = true;
    window.startHand = wrapped;
    return true;
  }

  function boot() {
    installStylesheet();
    activeProfile = guestProfile;
    activeSource = "guest";
    scheduleMount();
    installNameObserver();
    window.setTimeout(installNameObserver, 250);
    window.setTimeout(installNameObserver, 1000);
    authTimer = window.setInterval(async () => {
      if (window.TexasHoldemAuth?.version) wrapStartHandAfterAuth();
      await reconcileAuthState();
    }, CONFIG.authPollMs);
    renderActiveProfile();
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.querySelector("#playerProfileOverlay")?.hidden) closeEditor();
  });

  window.TexasHoldemPlayerProfile = Object.freeze({
    version: "1.0.0",
    open: openEditor,
    close: closeEditor,
    refresh: syncSignedInProfile,
    status: () => ({
      source: activeSource,
      signedIn: Boolean(window.TexasHoldemAuth?.status?.().signedIn),
      displayName: (activeProfile || guestProfile)?.displayName || DEFAULT_NAME,
      avatarKind: (activeProfile || guestProfile)?.avatarKind || "preset",
      syncing,
      lastError,
    }),
  });

  boot();
})();
