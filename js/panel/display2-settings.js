    // ===== DISPLAY 2 — Settings & Broadcast =====
    // Manages independent settings for Display 2 and sends a second payload
    // on the BroadcastChannel 'bible_song_pro_display2'.

    'use strict';

    const D2_CHANNEL_NAME = 'bible_song_pro_display2';
    const D2_STORAGE_KEY  = 'bsp_display2_settings';
    const D2_IDB_NAME     = 'bible-song-pro-sync-d2';
    const D2_IDB_VERSION  = 1;
    const D2_IDB_STORE    = 'messages';
    const D2_IDB_LAST_KEY = 'last';

    let d2Channel = null;
    try {
      d2Channel = (typeof BroadcastChannel === 'function')
        ? new BroadcastChannel(D2_CHANNEL_NAME)
        : null;
    } catch (_) {}

    // ── IDB mirror so Display 2 can sync on load ──────────────────────────
    let d2IdbPromise = null;
    function openD2Idb() {
      if (d2IdbPromise) return d2IdbPromise;
      d2IdbPromise = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(D2_IDB_NAME, D2_IDB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(D2_IDB_STORE)) {
              db.createObjectStore(D2_IDB_STORE);
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror  = () => reject(req.error || new Error('D2 IDB open failed'));
        } catch (err) { reject(err); }
      }).catch(err => { d2IdbPromise = null; return Promise.reject(err); });
      return d2IdbPromise;
    }

    function d2MirrorMsg(msg) {
      if (!msg || !['UPDATE','CLEAR','SYNC_STATE'].includes(msg.type)) return;
      openD2Idb().then(db => new Promise((res, rej) => {
        try {
          const tx = db.transaction(D2_IDB_STORE, 'readwrite');
          tx.objectStore(D2_IDB_STORE).put({ ts: Date.now(), seq: Number(msg.seq || 0), msg }, D2_IDB_LAST_KEY);
          tx.oncomplete = () => res();
          tx.onerror    = () => rej(tx.error);
        } catch (e) { rej(e); }
      })).catch(() => {});
    }

    // ── Broadcast helpers ─────────────────────────────────────────────────
    function d2Send(msg) {
      if (d2Channel) {
        try { d2Channel.postMessage(msg); } catch (_) {}
      }
      d2MirrorMsg(msg);
      if (typeof relaySend === 'function') {
        relaySend(msg);
      }
    }

    // ── Default settings ──────────────────────────────────────────────────
    const D2_DEFAULTS = {
      enabled          : true,
      mode             : 'full',        // 'full' | '16-9' | 'custom'
      bgEnabled        : true,
      bgType           : 'color',       // 'color' | 'image' | 'video'
      bgColor          : '#000000',
      bgMode           : 'solid',       // 'solid' | 'gradient'
      bgOpacity        : 1,
      bgBlur           : 0,
      bgImage          : null,
      bgVideo          : null,
      bgVideoLoop      : true,
      bgVideoSpeed     : 1,
      bgEdgeFix        : false,
      bgY              : 0,
      fontFamily       : '',
      fontWeight       : '700',
      fontSizeFull     : 60,
      fontSizeLT       : 36,
      lineHeightFull   : 1.1,
      lineHeightLT     : 1.1,
      textColor        : '#ffffff',
      textTransform    : 'uppercase',   // 'uppercase' | 'none' | 'capitalize' | 'lowercase'
      ltBgHeightPct    : 25,
      ltAnchorMode     : 'bottom',      // 'bottom' | 'top'
      hAlignFull       : 'center',
      vAlignFull       : 'middle',
      hAlignLT         : 'center',
      vAlignLT         : 'middle',
      ltWidthPct       : 100,
      ltOffsetX        : 0,
      ltOffsetY        : 0,
      ltBorderRadius   : 0,
      padLRFull        : 5,
      padLRLT          : 5,
      transitionType   : 'fade',
      transitionDuration: 0.5,
      animateBgTransitions: false
    };

    function getDisplay2Settings() {
      try {
        const raw = localStorage.getItem(D2_STORAGE_KEY);
        if (!raw) return { ...D2_DEFAULTS };
        const parsed = JSON.parse(raw);
        return { ...D2_DEFAULTS, ...parsed };
      } catch (_) {
        return { ...D2_DEFAULTS };
      }
    }

    function saveDisplay2Settings(patch) {
      try {
        const current = getDisplay2Settings();
        const next = { ...current, ...patch };
        localStorage.setItem(D2_STORAGE_KEY, JSON.stringify(next));
      } catch (_) {}
    }

    // ── Payload override ──────────────────────────────────────────────────
    // Takes the full Display 1 payload and overrides display settings with D2 values.
    function applyDisplay2SettingsToPayload(basePayload) {
      const s = getDisplay2Settings();
      return {
        ...basePayload,
        // Mode / ratio
        mode               : s.mode,
        // Background
        bgEnabled          : s.bgEnabled,
        bgType             : s.bgType,
        bgColor            : s.bgColor,
        bgMode             : s.bgMode,
        bgOpacity          : s.bgOpacity,
        bgBlur             : s.bgBlur,
        bgImage            : s.bgImage,
        bgVideo            : s.bgVideo,
        bgVideoLoop        : s.bgVideoLoop,
        bgVideoSpeed       : s.bgVideoSpeed,
        bgEdgeFix          : s.bgEdgeFix,
        bgY                : s.bgY,
        animateBgTransitions: s.animateBgTransitions,
        // Typography
        fontFamily         : s.fontFamily || basePayload.fontFamily || '',
        fontWeight         : s.fontWeight || basePayload.fontWeight || '700',
        fontSizeFull       : s.fontSizeFull,
        fontSizeLT         : s.fontSizeLT,
        lineHeightFull     : s.lineHeightFull,
        lineHeightLT       : s.lineHeightLT,
        textColor          : s.textColor,
        fullTextTransform  : s.textTransform,
        ltTextTransform    : s.textTransform,
        // LT geometry
        ltBgHeightPct      : s.ltBgHeightPct,
        ltAnchorMode       : s.ltAnchorMode,
        ltWidthPct         : s.ltWidthPct,
        ltOffsetX          : s.ltOffsetX,
        ltOffsetY          : s.ltOffsetY,
        ltBorderRadius     : s.ltBorderRadius,
        // Alignment
        hAlignFull         : s.hAlignFull,
        vAlignFull         : s.vAlignFull,
        hAlignLT           : s.hAlignLT,
        vAlignLT           : s.vAlignLT,
        hAlignLTBible      : s.hAlignLT,
        vAlignLTBible      : s.vAlignLT,
        // Padding
        padLRFull          : s.padLRFull,
        padLRLT            : s.padLRLT,
        padLR              : s.mode === 'full' ? s.padLRFull : s.padLRLT,
        // Transition
        transitionType     : s.transitionType,
        transitionDuration : s.transitionDuration
      };
    }

    // ── Broadcast to Display 2 ────────────────────────────────────────────
    function postUpdateDisplay2(basePayload) {
      const payload = applyDisplay2SettingsToPayload(basePayload);
      const msg = {
        type     : 'UPDATE',
        proto    : 1,
        sender   : 'control',
        target   : 'display2',
        ts       : Date.now(),
        seq      : basePayload.seq,        // same seq so D2 stays in sync
        ...payload
      };
      d2Send(msg);
    }

    function postClearDisplay2(opts = {}) {
      const msg = { type: 'CLEAR', proto: 1, sender: 'control', target: 'display2', ts: Date.now(), seq: 0 };
      if (opts.transitionDuration != null) msg.transitionDuration = opts.transitionDuration;
      if (opts.fade != null) msg.fade = !!opts.fade;
      d2Send(msg);
    }

    function syncStateDisplay2() {
      if (!lastLiveState) return;
      let state;
      if (lastLiveState.kind === 'clear') {
        state = { kind: 'clear' };
      } else if (lastLiveState.kind === 'update' && lastLiveState.payload) {
        const d2Payload = applyDisplay2SettingsToPayload(lastLiveState.payload);
        state = { kind: 'update', payload: d2Payload };
      } else {
        return;
      }
      const msg = { type: 'SYNC_STATE', proto: 1, sender: 'control', target: 'display2', ts: Date.now(), seq: 0, state };
      d2Send(msg);
    }

    // ── Open Display 2 window ─────────────────────────────────────────────
    let d2Window = null;
    function openDisplay2Window() {
      const params = new URLSearchParams();
      params.set('embedded', '1');
      const url = `BSP_display2.html?${params.toString()}`;
      if (d2Window && !d2Window.closed) {
        d2Window.focus();
        return;
      }
      d2Window = window.open(url, 'BSP_Display2', 'noopener,width=1280,height=720');
      saveDisplay2Settings({ enabled: true });
      // Send current state after a short delay to let the window initialize
      setTimeout(() => syncStateDisplay2(), 1500);
    }

    // ── UI Rendering ──────────────────────────────────────────────────────
    function renderDisplay2SettingsPanel() {
      const host = document.getElementById('display2-settings-host');
      if (!host) return;
      const s = getDisplay2Settings();

      host.innerHTML = `
<div class="d2-settings-panel">
  <div class="d2-settings-header">
    <span class="d2-badge">DISPLAY 2</span>
    <span class="d2-subtitle">Independent display with shared content</span>
    <button id="d2-open-btn" class="d2-open-btn${s.enabled ? ' d2-active' : ''}" onclick="openDisplay2Window()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
      Open Display 2
    </button>
  </div>

  <!-- Mode -->
  <div class="d2-row">
    <label class="d2-label">Display Mode</label>
    <div class="d2-seg" id="d2-mode-picker">
      <button class="d2-seg-btn${s.mode==='full'?' active':''}" onclick="d2SetMode('full')">Full</button>
      <button class="d2-seg-btn${s.mode==='16-9'?' active':''}" onclick="d2SetMode('16-9')">Lower Third</button>
    </div>
  </div>

  <!-- Background Toggle -->
  <div class="d2-row">
    <label class="d2-label">Background</label>
    <div class="d2-seg">
      <button class="d2-seg-btn${s.bgEnabled?' active':''}" onclick="d2SetBgEnabled(true)">On</button>
      <button class="d2-seg-btn${!s.bgEnabled?' active':''}" onclick="d2SetBgEnabled(false)">Off</button>
    </div>
  </div>

  <!-- Background Type -->
  <div class="d2-row" id="d2-bg-type-row" style="${s.bgEnabled?'':'opacity:0.4;pointer-events:none'}">
    <label class="d2-label">BG Type</label>
    <div class="d2-seg">
      <button class="d2-seg-btn${s.bgType==='color'?' active':''}" onclick="d2SetBgType('color')">Color</button>
      <button class="d2-seg-btn${s.bgType==='image'?' active':''}" onclick="d2SetBgType('image')">Image</button>
    </div>
  </div>

  <!-- BG Color -->
  <div class="d2-row" id="d2-bg-color-row" style="${(s.bgEnabled && s.bgType==='color')?'':'display:none'}">
    <label class="d2-label">BG Color</label>
    <div class="d2-color-wrap">
      <input type="color" id="d2-bg-color" value="${s.bgColor}" oninput="d2SaveAndResend({bgColor:this.value})">
      <input type="text" id="d2-bg-color-hex" value="${s.bgColor}" maxlength="7"
        oninput="d2OnColorHexInput('d2-bg-color','d2-bg-color-hex','bgColor')">
    </div>
  </div>

  <!-- BG Opacity -->
  <div class="d2-row" id="d2-bg-opacity-row" style="${s.bgEnabled?'':'opacity:0.4;pointer-events:none'}">
    <label class="d2-label">BG Opacity</label>
    <input type="range" id="d2-bg-opacity" min="0" max="1" step="0.01" value="${s.bgOpacity}"
      oninput="d2SaveAndResend({bgOpacity:parseFloat(this.value)})" style="flex:1">
    <span id="d2-bg-opacity-val" style="min-width:32px;text-align:right;font-size:12px;color:var(--text-muted,#888)">${Math.round(s.bgOpacity*100)}%</span>
  </div>

  <!-- BG Image -->
  <div class="d2-row" id="d2-bg-image-row" style="${(s.bgEnabled && s.bgType==='image')?'':'display:none'}">
    <label class="d2-label">BG Image</label>
    <div style="flex:1;display:flex;flex-direction:column;gap:6px">
      <button class="d2-pick-btn" onclick="d2PickBgImage()">Choose Image…</button>
      <span id="d2-bg-image-name" style="font-size:11px;color:var(--text-muted,#888);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.bgImage ? '(image set)' : 'No image'}</span>
    </div>
  </div>

  <!-- LT Height (only in LT mode) -->
  <div class="d2-row" id="d2-lt-height-row" style="${s.mode==='16-9'?'':'display:none'}">
    <label class="d2-label">LT Height %</label>
    <input type="range" id="d2-lt-height" min="8" max="60" step="1" value="${s.ltBgHeightPct}"
      oninput="d2SaveAndResend({ltBgHeightPct:parseInt(this.value)})" style="flex:1">
    <span id="d2-lt-height-val" style="min-width:32px;text-align:right;font-size:12px;color:var(--text-muted,#888)">${s.ltBgHeightPct}%</span>
  </div>

  <!-- LT Anchor (only in LT mode) -->
  <div class="d2-row" id="d2-lt-anchor-row" style="${s.mode==='16-9'?'':'display:none'}">
    <label class="d2-label">LT Position</label>
    <div class="d2-seg">
      <button class="d2-seg-btn${s.ltAnchorMode==='bottom'?' active':''}" onclick="d2SetLtAnchor('bottom')">Bottom</button>
      <button class="d2-seg-btn${s.ltAnchorMode==='top'?' active':''}" onclick="d2SetLtAnchor('top')">Top</button>
    </div>
  </div>

  <!-- Font size -->
  <div class="d2-row">
    <label class="d2-label">${s.mode==='16-9'?'LT':'Full'} Font Size</label>
    <input type="range" id="d2-font-size" min="12" max="200" step="1"
      value="${s.mode==='16-9'?s.fontSizeLT:s.fontSizeFull}"
      oninput="d2OnFontSizeInput(this)" style="flex:1">
    <span id="d2-font-size-val" style="min-width:32px;text-align:right;font-size:12px;color:var(--text-muted,#888)">${s.mode==='16-9'?s.fontSizeLT:s.fontSizeFull}pt</span>
  </div>

  <!-- Text Color -->
  <div class="d2-row">
    <label class="d2-label">Text Color</label>
    <div class="d2-color-wrap">
      <input type="color" id="d2-text-color" value="${s.textColor}" oninput="d2SaveAndResend({textColor:this.value})">
      <input type="text" id="d2-text-color-hex" value="${s.textColor}" maxlength="7"
        oninput="d2OnColorHexInput('d2-text-color','d2-text-color-hex','textColor')">
    </div>
  </div>

  <!-- Font Family -->
  <div class="d2-row">
    <label class="d2-label">Font</label>
    <select id="d2-font-family" style="flex:1;padding:5px 8px;border-radius:7px;border:1px solid var(--border,rgba(255,255,255,0.1));background:var(--bg-panel,#1c1c1e);color:var(--text,#c9d1da);font-size:12px"
      onchange="d2SaveAndResend({fontFamily:this.value})">
      <option value="" ${!s.fontFamily?'selected':''}>Default (follow Display 1)</option>
      <option value="'Montserrat',sans-serif" ${s.fontFamily==="'Montserrat',sans-serif"?'selected':''}>Montserrat</option>
      <option value="'Segoe UI',sans-serif" ${s.fontFamily==="'Segoe UI',sans-serif"?'selected':''}>Segoe UI</option>
      <option value="'CMGSans',sans-serif" ${s.fontFamily==="'CMGSans',sans-serif"?'selected':''}>CMGSans</option>
      <option value="'Noto Sans',sans-serif" ${s.fontFamily==="'Noto Sans',sans-serif"?'selected':''}>Noto Sans (multi)</option>
      <option value="'Noto Sans Arabic',sans-serif" ${s.fontFamily==="'Noto Sans Arabic',sans-serif"?'selected':''}>Noto Sans Arabic</option>
      <option value="'Noto Sans Hebrew',sans-serif" ${s.fontFamily==="'Noto Sans Hebrew',sans-serif"?'selected':''}>Noto Sans Hebrew</option>
      <option value="'Noto Serif',serif" ${s.fontFamily==="'Noto Serif',serif"?'selected':''}>Noto Serif</option>
    </select>
  </div>

  <!-- Font Weight -->
  <div class="d2-row">
    <label class="d2-label">Weight</label>
    <div class="d2-seg">
      <button class="d2-seg-btn${s.fontWeight==='400'?' active':''}"  onclick="d2SaveAndResend({fontWeight:'400'})">Regular</button>
      <button class="d2-seg-btn${s.fontWeight==='600'?' active':''}"  onclick="d2SaveAndResend({fontWeight:'600'})">Semi-Bold</button>
      <button class="d2-seg-btn${s.fontWeight==='700'?' active':''}"  onclick="d2SaveAndResend({fontWeight:'700'})">Bold</button>
      <button class="d2-seg-btn${s.fontWeight==='900'?' active':''}"  onclick="d2SaveAndResend({fontWeight:'900'})">Black</button>
    </div>
  </div>

  <!-- Text Transform -->
  <div class="d2-row">
    <label class="d2-label">Case</label>
    <div class="d2-seg">
      <button class="d2-seg-btn${s.textTransform==='uppercase'?' active':''}"  onclick="d2SaveAndResend({textTransform:'uppercase'})">ALL CAPS</button>
      <button class="d2-seg-btn${s.textTransform==='capitalize'?' active':''}" onclick="d2SaveAndResend({textTransform:'capitalize'})">Title</button>
      <button class="d2-seg-btn${s.textTransform==='none'?' active':''}"       onclick="d2SaveAndResend({textTransform:'none'})">none</button>
    </div>
  </div>

  <!-- Horizontal align -->
  <div class="d2-row">
    <label class="d2-label">H Align</label>
    <div class="d2-seg" id="d2-h-align-picker">
      <button class="d2-seg-btn${(s.mode==='16-9'?s.hAlignLT:s.hAlignFull)==='left'?' active':''}"   onclick="d2SetHAlign('left')">Left</button>
      <button class="d2-seg-btn${(s.mode==='16-9'?s.hAlignLT:s.hAlignFull)==='center'?' active':''}" onclick="d2SetHAlign('center')">Center</button>
      <button class="d2-seg-btn${(s.mode==='16-9'?s.hAlignLT:s.hAlignFull)==='right'?' active':''}"  onclick="d2SetHAlign('right')">Right</button>
    </div>
  </div>

  <!-- Vertical align -->
  <div class="d2-row">
    <label class="d2-label">V Align</label>
    <div class="d2-seg" id="d2-v-align-picker">
      <button class="d2-seg-btn${(s.mode==='16-9'?s.vAlignLT:s.vAlignFull)==='top'?' active':''}"    onclick="d2SetVAlign('top')">Top</button>
      <button class="d2-seg-btn${(s.mode==='16-9'?s.vAlignLT:s.vAlignFull)==='middle'?' active':''}" onclick="d2SetVAlign('middle')">Middle</button>
      <button class="d2-seg-btn${(s.mode==='16-9'?s.vAlignLT:s.vAlignFull)==='bottom'?' active':''}" onclick="d2SetVAlign('bottom')">Bottom</button>
    </div>
  </div>

  <!-- Padding LR -->
  <div class="d2-row">
    <label class="d2-label">H Padding %</label>
    <input type="range" id="d2-pad-lr" min="0" max="30" step="1"
      value="${s.mode==='16-9'?s.padLRLT:s.padLRFull}"
      oninput="d2OnPadInput(this)" style="flex:1">
    <span id="d2-pad-lr-val" style="min-width:32px;text-align:right;font-size:12px;color:var(--text-muted,#888)">${s.mode==='16-9'?s.padLRLT:s.padLRFull}%</span>
  </div>

  <!-- Transition -->
  <div class="d2-row">
    <label class="d2-label">Transition</label>
    <div class="d2-seg">
      <button class="d2-seg-btn${s.transitionType==='cut'?' active':''}"  onclick="d2SetTransition('cut')">Cut</button>
      <button class="d2-seg-btn${s.transitionType==='fade'?' active':''}"  onclick="d2SetTransition('fade')">Fade</button>
      <button class="d2-seg-btn${s.transitionType==='zoom'?' active':''}"  onclick="d2SetTransition('zoom')">Zoom</button>
      <button class="d2-seg-btn${s.transitionType==='slide'?' active':''}" onclick="d2SetTransition('slide')">Slide</button>
    </div>
  </div>
</div>`;

      // Sync range value labels live
      const bgOpacityEl = document.getElementById('d2-bg-opacity');
      if (bgOpacityEl) {
        bgOpacityEl.addEventListener('input', () => {
          const v = document.getElementById('d2-bg-opacity-val');
          if (v) v.textContent = Math.round(parseFloat(bgOpacityEl.value) * 100) + '%';
        });
      }
      const ltHeightEl = document.getElementById('d2-lt-height');
      if (ltHeightEl) {
        ltHeightEl.addEventListener('input', () => {
          const v = document.getElementById('d2-lt-height-val');
          if (v) v.textContent = ltHeightEl.value + '%';
        });
      }
      const fontSizeEl = document.getElementById('d2-font-size');
      if (fontSizeEl) {
        fontSizeEl.addEventListener('input', () => {
          const v = document.getElementById('d2-font-size-val');
          if (v) v.textContent = fontSizeEl.value + 'pt';
        });
      }
      const padEl = document.getElementById('d2-pad-lr');
      if (padEl) {
        padEl.addEventListener('input', () => {
          const v = document.getElementById('d2-pad-lr-val');
          if (v) v.textContent = padEl.value + '%';
        });
      }
    }

    // ── Control handlers ──────────────────────────────────────────────────
    function d2SaveAndResend(patch) {
      saveDisplay2Settings(patch);
      if (lastLiveState && lastLiveState.kind === 'update' && lastLiveState.payload) {
        postUpdateDisplay2(lastLiveState.payload);
      }
    }

    function d2SetMode(mode) {
      saveDisplay2Settings({ mode });
      renderDisplay2SettingsPanel();
      d2SaveAndResend({});
    }

    function d2SetBgEnabled(val) {
      d2SaveAndResend({ bgEnabled: val });
      renderDisplay2SettingsPanel();
    }

    function d2SetBgType(type) {
      d2SaveAndResend({ bgType: type });
      renderDisplay2SettingsPanel();
    }

    function d2SetLtAnchor(anchor) {
      d2SaveAndResend({ ltAnchorMode: anchor });
      renderDisplay2SettingsPanel();
    }

    function d2SetHAlign(val) {
      const s = getDisplay2Settings();
      const patch = (s.mode === '16-9')
        ? { hAlignLT: val }
        : { hAlignFull: val };
      d2SaveAndResend(patch);
      renderDisplay2SettingsPanel();
    }

    function d2SetVAlign(val) {
      const s = getDisplay2Settings();
      const patch = (s.mode === '16-9')
        ? { vAlignLT: val }
        : { vAlignFull: val };
      d2SaveAndResend(patch);
      renderDisplay2SettingsPanel();
    }

    function d2SetTransition(type) {
      const patch = { transitionType: type };
      if (type === 'cut') patch.transitionDuration = 0;
      d2SaveAndResend(patch);
      renderDisplay2SettingsPanel();
    }

    function d2OnFontSizeInput(el) {
      const s = getDisplay2Settings();
      const patch = (s.mode === '16-9')
        ? { fontSizeLT: parseInt(el.value) }
        : { fontSizeFull: parseInt(el.value) };
      d2SaveAndResend(patch);
    }

    function d2OnPadInput(el) {
      const s = getDisplay2Settings();
      const patch = (s.mode === '16-9')
        ? { padLRLT: parseInt(el.value) }
        : { padLRFull: parseInt(el.value) };
      d2SaveAndResend(patch);
    }

    function d2OnColorHexInput(colorInputId, hexInputId, settingKey) {
      const hexInput = document.getElementById(hexInputId);
      const colorInput = document.getElementById(colorInputId);
      if (!hexInput || !colorInput) return;
      const val = hexInput.value;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        colorInput.value = val;
        d2SaveAndResend({ [settingKey]: val });
      }
    }

    function d2PickBgImage() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target.result;
          saveDisplay2Settings({ bgImage: dataUrl, bgType: 'image' });
          const nameEl = document.getElementById('d2-bg-image-name');
          if (nameEl) nameEl.textContent = file.name;
          d2SaveAndResend({});
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
