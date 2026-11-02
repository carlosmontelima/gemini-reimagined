/**
 * ============================================================================
 * Gemini Reimagined — Content Script Principal (content.js)
 * ============================================================================
 * Responsabilidades:
 * 1. Injetar fontes (Inter, Fira Code, Press Start 2P) e gerenciar variáveis CSS
 *    (--custom-font-family, --custom-font-size) no :root em tempo real.
 * 2. Salvar/carregar preferências do usuário (localStorage + chrome.storage.local).
 * 3. Inicializar o Wallpaper Engine (background-canvas.js) com transição suave.
 * 4. Injetar a Preview Animada do Tema (escura e borrada) dentro da própria barra
 *    de digitação (.text-input-field) sem alterar o fluxo dos botões nativos.
 * 5. Gerenciar o Relógio Dinâmico (3 estados: Desativado, Hora+Min, Hora+Min+Seg)
 *    exibido exclusivamente na página inicial centralizado acima das boas-vindas.
 * 6. Injetar o botão do GitHub e o seletor do Relógio no canto inferior direito,
 *    além do "Menu da Setinha" com quadradinhos de preview em Pixel Art.
 * ============================================================================
 */

(function () {
  'use strict';

  if (window.__geminiReimaginedLoaded) return;
  window.__geminiReimaginedLoaded = true;

  const STORAGE_KEY = 'gr_preferences_v1';
  const GITHUB_REPO_URL = 'https://github.com/carlosmontelima/gemini-reimagined';

  const FONT_OPTIONS = [
    {
      id: 'Inter',
      label: 'Inter (Clean Sans)',
      cssValue: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    },
    {
      id: 'Fira Code',
      label: 'Fira Code (Dev Mono)',
      cssValue: "'Fira Code', 'JetBrains Mono', Consolas, monospace"
    },
    {
      id: 'Press Start 2P',
      label: 'Press Start 2P (Pixel)',
      cssValue: "'Press Start 2P', 'Fira Code', monospace"
    },
    {
      id: 'Serif',
      label: 'Serif (Editorial)',
      cssValue: "Georgia, 'Merriweather', 'Times New Roman', serif"
    }
  ];

  // Estados possíveis do botão de relógio: 'off' (Desativado), 'hm' (Hora+Min), 'hms' (Hora+Min+Seg)
  const CLOCK_MODES = [
    { id: 'off', badge: 'OFF', title: 'Relógio: Desativado (Clique para Hora+Min)' },
    { id: 'hm', badge: 'HH:MM', title: 'Relógio: Hora + Min (Clique para Hora+Min+Seg)' },
    { id: 'hms', badge: 'HH:MM:SS', title: 'Relógio: Hora + Min + Seg (Clique para Desativar)' }
  ];

  const DEFAULT_PREFS = {
    fontFamily: 'Inter',
    fontSize: 16,
    theme: 'ocean',
    clockMode: 'hm'
  };

  let state = {
    prefs: { ...DEFAULT_PREFS },
    isMenuOpen: false,
    inputBoxEl: null
  };

  let shadowRoot = null;
  let hostEl = null;
  let uiRefs = {};
  let inputResizeObserver = null;
  let previewControllers = [];
  let previewTimerId = null;

  // Estado da Preview Animada dentro da Barra de Input
  let inputLiveCanvas = null;
  let inputLiveController = null;
  let inputLiveThemeId = null;
  let inputLiveTimerId = null;

  // Estado do Relógio Dinâmico na Página Inicial (nós persistentes para não piscar)
  let homeClockWrapperEl = null;
  let homeClockHmSpan = null;
  let homeClockSecSpan = null;
  let clockIntervalId = null;

  // ==========================================================================
  // 1. Carregamento de Fontes Externas (Google Fonts)
  // ==========================================================================
  function injectGoogleFonts() {
    if (document.getElementById('gr-google-fonts')) return;
    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';

    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.crossOrigin = 'anonymous';
    preconnect2.href = 'https://fonts.gstatic.com';

    const link = document.createElement('link');
    link.id = 'gr-google-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Inter:wght@400;500;600&family=Press+Start+2P&display=swap';

    document.head.appendChild(preconnect1);
    document.head.appendChild(preconnect2);
    document.head.appendChild(link);
  }

  // ==========================================================================
  // 2. Persistência de Preferências e Aplicação de Variáveis CSS no :root
  // ==========================================================================
  function loadPreferences(callback) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.prefs = { ...DEFAULT_PREFS, ...parsed };
      }
    } catch (_) {}

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (result && result[STORAGE_KEY]) {
            state.prefs = { ...DEFAULT_PREFS, ...result[STORAGE_KEY] };
          }
          callback(state.prefs);
        });
        return;
      } catch (_) {}
    }

    callback(state.prefs);
  }

  function savePreferences() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.prefs));
    } catch (_) {}

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: state.prefs });
      } catch (_) {}
    }
  }

  function applyTypographyVariables() {
    const root = document.documentElement;
    const fontEntry =
      FONT_OPTIONS.find((f) => f.id === state.prefs.fontFamily) || FONT_OPTIONS[0];
    const clampedSize = Math.max(14, Math.min(22, Number(state.prefs.fontSize) || 16));

    root.style.setProperty('--custom-font-family', fontEntry.cssValue);
    root.style.setProperty('--custom-font-size', `${clampedSize}px`);
  }

  // ==========================================================================
  // 3. Logo da Aba do Navegador (Favicon em Pixel Art) e Cores de Marca por Tema
  // ==========================================================================
  function generateThemedPixelFavicon(brand) {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    const p = 2;
    const rows = [
      '....bbbbbbbb....',
      '..bbccccccccbb..',
      '.bcchhhhhhhhccb.',
      '.bch......ssscb.',
      'bch....pp..ssscb',
      'bch....pp....scb',
      'bch...pppp...scb',
      'bch.pppppppp.scb',
      'bch...pppp...scb',
      'bch....ss....scb',
      'bch..pp..ss..scb',
      'bch..pp......scb',
      '.bch........scb.',
      '.bccssssssssccb.',
      '..bbccccccccbb..',
      '....bbbbbbbb....'
    ];

    const palette = {
      b: brand.bg || '#0f172a',
      c: brand.primary || '#38bdf8',
      h: 'rgba(255,255,255,0.22)',
      p: brand.primary || '#38bdf8',
      s: brand.secondary || '#818cf8'
    };

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        if (ch !== 'b') {
          g.fillStyle = brand.bg || '#0f172a';
          g.fillRect(x * p, y * p, p, p);
        }
        g.fillStyle = palette[ch] || '#ffffff';
        g.fillRect(x * p, y * p, p, p);
      }
    }

    g.fillStyle = '#ffffff';
    g.fillRect(7 * p, 7 * p, 2 * p, 2 * p);

    return c.toDataURL('image/png');
  }

  function updateGeminiBrandingForTheme(theme) {
    if (!theme) return;
    const brand = theme.brand || {
      primary: '#38bdf8',
      secondary: '#818cf8',
      bg: '#0f172a'
    };

    const root = document.documentElement;
    root.style.setProperty('--gr-brand-primary', brand.primary);
    root.style.setProperty('--gr-brand-secondary', brand.secondary);

    document.querySelectorAll('.gr-theme-logo-badge').forEach((el) => el.remove());

    try {
      const dataUrl = generateThemedPixelFavicon(brand);
      let iconLinks = document.querySelectorAll('link[rel*="icon"]');
      if (iconLinks.length === 0) {
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        document.head.appendChild(newLink);
        iconLinks = [newLink];
      }
      iconLinks.forEach((link) => {
        link.type = 'image/png';
        link.href = dataUrl;
      });
    } catch (_) {}

    refreshInputLivePreviewTheme(theme.id);
  }

  // ==========================================================================
  // 4. Preview Animada do Tema Dentro da Barra de Input (Escura e Borrada)
  // ==========================================================================
  function ensureInputLivePreviewAttached() {
    const inputField = document.querySelector('.text-input-field');
    if (!inputField) return;

    let bgWrap = inputField.querySelector('.gr-input-live-bg');
    if (!bgWrap) {
      bgWrap = document.createElement('div');
      bgWrap.className = 'gr-input-live-bg';
      bgWrap.setAttribute('aria-hidden', 'true');

      inputLiveCanvas = document.createElement('canvas');
      inputLiveCanvas.className = 'gr-input-live-canvas';
      inputLiveCanvas.width = 200;
      inputLiveCanvas.height = 56;

      const overlay = document.createElement('div');
      overlay.className = 'gr-input-live-overlay';

      bgWrap.appendChild(inputLiveCanvas);
      bgWrap.appendChild(overlay);
      inputField.appendChild(bgWrap);

      inputLiveThemeId = null;
    } else if (!inputLiveCanvas || !inputLiveCanvas.isConnected) {
      inputLiveCanvas = bgWrap.querySelector('.gr-input-live-canvas');
    }

    const targetTheme = state.prefs.theme || 'ocean';
    if (inputLiveCanvas && inputLiveThemeId !== targetTheme && window.GeminiWallpaperEngine) {
      refreshInputLivePreviewTheme(targetTheme);
    }

    startInputLiveLoop();
  }

  function refreshInputLivePreviewTheme(themeId) {
    if (!inputLiveCanvas || !window.GeminiWallpaperEngine) return;
    inputLiveThemeId = themeId;
    inputLiveController = window.GeminiWallpaperEngine.createPreviewInstance(
      themeId,
      inputLiveCanvas
    );
  }

  function startInputLiveLoop() {
    if (inputLiveTimerId !== null) return;
    inputLiveTimerId = setInterval(() => {
      if (document.hidden || !inputLiveController || !inputLiveCanvas || !inputLiveCanvas.isConnected) {
        return;
      }
      inputLiveController.step(0.055);
    }, 55);
  }

  // ==========================================================================
  // 5. Relógio Dinâmico na Página Inicial (3 Estados: Desativado, HH:MM, HH:MM:SS)
  // ==========================================================================
  function findWelcomeHeadingTarget() {
    // Se houver qualquer mensagem de conversa ativa, NÃO estamos na tela inicial!
    const hasConversationMessages = document.querySelector(
      'user-query, model-response, .user-query-container, .model-response-container'
    );
    if (hasConversationMessages) return null;

    const candidates = [
      '.zero-state-container',
      '.new-chat-zero-state',
      'zero-state',
      'modular-zero-state',
      '[class*="zero-state"]',
      'main h1'
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        return el;
      }
    }

    return null;
  }

  function formatCurrentTimeParts(mode) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return {
      hm: `${hh}:${mm}`,
      ss: mode === 'hms' ? `:${ss}` : ''
    };
  }

  function syncHomeClock() {
    const mode = state.prefs.clockMode || 'off';
    const welcomeTarget = findWelcomeHeadingTarget();

    // Se estiver desativado ou dentro de uma conversa, remove o relógio
    if (mode === 'off' || !welcomeTarget) {
      if (homeClockWrapperEl && homeClockWrapperEl.isConnected) {
        homeClockWrapperEl.remove();
      }
      return;
    }

    if (!homeClockWrapperEl) {
      homeClockWrapperEl = document.createElement('div');
      homeClockWrapperEl.id = 'gr-home-clock-wrapper';

      const pill = document.createElement('div');
      pill.className = 'gr-home-clock-pill';

      homeClockHmSpan = document.createElement('span');
      homeClockSecSpan = document.createElement('span');
      homeClockSecSpan.className = 'gr-home-clock-sec';

      pill.appendChild(homeClockHmSpan);
      pill.appendChild(homeClockSecSpan);
      homeClockWrapperEl.appendChild(pill);
    }

    // Insere APENAS se ainda não estiver anexado ao container correto (evita re-inserir e piscar!)
    const desiredParent =
      welcomeTarget.tagName === 'H1' && welcomeTarget.parentElement
        ? welcomeTarget.parentElement
        : welcomeTarget;

    if (!homeClockWrapperEl.isConnected || homeClockWrapperEl.parentElement !== desiredParent) {
      if (welcomeTarget.tagName === 'H1' && welcomeTarget.parentElement) {
        welcomeTarget.parentElement.insertBefore(homeClockWrapperEl, welcomeTarget);
      } else {
        welcomeTarget.prepend(homeClockWrapperEl);
      }
    }

    // Atualiza somente o textContent se mudou (zero reflow / zero flicker)
    const parts = formatCurrentTimeParts(mode);
    if (homeClockHmSpan.textContent !== parts.hm) {
      homeClockHmSpan.textContent = parts.hm;
    }
    if (homeClockSecSpan.textContent !== parts.ss) {
      homeClockSecSpan.textContent = parts.ss;
    }
  }

  function startClockTicker() {
    if (clockIntervalId !== null) return;
    syncHomeClock();
    clockIntervalId = setInterval(() => {
      if (document.hidden) return;
      syncHomeClock();
    }, 1000);
  }

  function cycleClockMode() {
    const currentIdx = CLOCK_MODES.findIndex((m) => m.id === state.prefs.clockMode);
    const nextIdx = (currentIdx + 1) % CLOCK_MODES.length;
    state.prefs.clockMode = CLOCK_MODES[nextIdx].id;
    savePreferences();
    syncClockButtonUI();
    syncHomeClock();
  }

  function syncClockButtonUI() {
    if (!uiRefs.clockBtn || !uiRefs.clockBadge) return;
    const modeObj =
      CLOCK_MODES.find((m) => m.id === state.prefs.clockMode) || CLOCK_MODES[0];
    uiRefs.clockBadge.textContent = modeObj.badge;
    uiRefs.clockBtn.title = modeObj.title;
    uiRefs.clockBtn.classList.toggle('active', modeObj.id !== 'off');
  }

  // ==========================================================================
  // 6. Alinhamento do Botão da Setinha logo acima da Barra de Input
  // ==========================================================================
  function findGeminiInputBox() {
    return (
      document.querySelector('.text-input-field') ||
      document.querySelector('input-container') ||
      document.querySelector('.input-area-container')
    );
  }

  function syncArrowPositionWithInput() {
    if (!uiRefs.wrapper) return;

    if (!state.inputBoxEl || !state.inputBoxEl.isConnected) {
      const found = findGeminiInputBox();
      if (found) {
        state.inputBoxEl = found;
        if (inputResizeObserver) {
          inputResizeObserver.disconnect();
        } else if (typeof ResizeObserver !== 'undefined') {
          inputResizeObserver = new ResizeObserver(() => {
            syncArrowPositionWithInput();
          });
        }
        if (inputResizeObserver) {
          inputResizeObserver.observe(found);
        }
      }
    }

    if (state.inputBoxEl && state.inputBoxEl.isConnected) {
      const rect = state.inputBoxEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const bottomPx = Math.max(16, Math.round(window.innerHeight - rect.top + 8));
        const centerX = Math.round(rect.left + rect.width / 2);
        uiRefs.wrapper.style.setProperty('--gr-arrow-bottom', `${bottomPx}px`);
        uiRefs.wrapper.style.setProperty('--gr-arrow-left', `${centerX}px`);
        return;
      }
    }

    uiRefs.wrapper.style.setProperty('--gr-arrow-bottom', '118px');
    uiRefs.wrapper.style.setProperty('--gr-arrow-left', '50%');
  }

  // ==========================================================================
  // 7. Menu da Setinha + Dock Inferior Direito (Relógio 3 Estados + Ícone GitHub)
  // ==========================================================================
  function startPreviewAnimationLoop() {
    if (previewTimerId !== null) return;
    previewTimerId = setInterval(() => {
      if (!state.isMenuOpen || document.hidden) return;
      for (let i = 0; i < previewControllers.length; i++) {
        previewControllers[i].step(0.08);
      }
    }, 80);
  }

  function stopPreviewAnimationLoop() {
    if (previewTimerId !== null) {
      clearInterval(previewTimerId);
      previewTimerId = null;
    }
  }

  function buildShadowMenu() {
    if (document.getElementById('gr-ui-host')) return;

    hostEl = document.createElement('div');
    hostEl.id = 'gr-ui-host';
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2147483000;
        pointer-events: none;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      .gr-anchor {
        position: fixed;
        left: var(--gr-arrow-left, 50%);
        bottom: var(--gr-arrow-bottom, 118px);
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        transition:
          bottom 0.25s cubic-bezier(0.16, 1, 0.3, 1),
          left 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      /* Painel Flutuante Largo (Horizontal) em Glassmorphism */
      .gr-panel {
        pointer-events: none;
        width: 590px;
        max-width: calc(100vw - 28px);
        margin-bottom: 10px;
        padding: 18px 20px;
        border-radius: 24px;
        background: rgba(8, 17, 30, 0.84);
        backdrop-filter: blur(22px) saturate(165%);
        -webkit-backdrop-filter: blur(22px) saturate(165%);
        border: 1px solid rgba(255, 255, 255, 0.22);
        box-shadow:
          0 24px 60px rgba(0, 4, 14, 0.65),
          inset 0 1px 0 rgba(255, 255, 255, 0.22);
        color: #f1f5f9;
        opacity: 0;
        transform: translateY(14px) scale(0.96);
        transform-origin: bottom center;
        transition:
          opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1),
          transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .gr-panel.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .gr-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }

      .gr-panel-title {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(226, 232, 240, 0.94);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .gr-badge {
        font-size: 10.5px;
        padding: 3px 9px;
        border-radius: 999px;
        background: rgba(56, 189, 248, 0.18);
        border: 1px solid rgba(56, 189, 248, 0.38);
        color: #7dd3fc;
        font-weight: 500;
      }

      .gr-controls-row {
        display: grid;
        grid-template-columns: 1.15fr 1fr;
        gap: 16px;
        margin-bottom: 16px;
        align-items: end;
      }

      @media (max-width: 520px) {
        .gr-controls-row {
          grid-template-columns: 1fr;
        }
      }

      .gr-field {
        display: flex;
        flex-direction: column;
      }

      .gr-label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }

      .gr-label {
        font-size: 11.5px;
        font-weight: 600;
        color: rgba(203, 213, 225, 0.92);
        letter-spacing: 0.02em;
      }

      .gr-value-pill {
        font-size: 11px;
        font-weight: 600;
        color: #38bdf8;
        background: rgba(15, 23, 42, 0.65);
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid rgba(56, 189, 248, 0.28);
      }

      .gr-select {
        width: 100%;
        padding: 8px 12px;
        border-radius: 12px;
        background: rgba(15, 28, 48, 0.70);
        border: 1px solid rgba(255, 255, 255, 0.18);
        color: #f8fafc;
        font-size: 12.5px;
        outline: none;
        cursor: pointer;
        transition: border-color 0.2s ease, background 0.2s ease;
      }

      .gr-select:hover,
      .gr-select:focus {
        border-color: rgba(125, 211, 252, 0.58);
        background: rgba(22, 40, 68, 0.86);
      }

      .gr-select option {
        background: #0f172a;
        color: #f8fafc;
      }

      .gr-slider-wrap {
        display: flex;
        align-items: center;
        height: 35px;
        padding: 0 10px;
        border-radius: 12px;
        background: rgba(15, 28, 48, 0.50);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .gr-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
        outline: none;
        cursor: pointer;
      }

      .gr-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 17px;
        height: 17px;
        border-radius: 50%;
        background: linear-gradient(135deg, #7dd3fc, #38bdf8);
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(56, 189, 248, 0.55);
        cursor: pointer;
        transition: transform 0.15s ease;
      }

      .gr-slider::-webkit-slider-thumb:hover {
        transform: scale(1.14);
      }

      /* Grade Horizontal de Quadradinhos de Tema com Preview em Pixel Art */
      .gr-theme-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
        gap: 10px;
        max-height: 240px;
        overflow-y: auto;
        padding: 2px;
      }

      .gr-theme-card {
        display: flex;
        flex-direction: column;
        padding: 6px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: #e2e8f0;
        cursor: pointer;
        transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        text-align: left;
        position: relative;
      }

      .gr-theme-card:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.34);
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
      }

      .gr-theme-card.active {
        background: rgba(56, 189, 248, 0.18);
        border-color: #7dd3fc;
        box-shadow: 0 0 18px rgba(56, 189, 248, 0.28), inset 0 0 0 1px rgba(125, 211, 252, 0.45);
      }

      .gr-preview-box {
        width: 100%;
        height: 58px;
        border-radius: 9px;
        overflow: hidden;
        position: relative;
        border: 1px solid rgba(255, 255, 255, 0.16);
        margin-bottom: 6px;
        background: #090d16;
      }

      .gr-preview-canvas {
        width: 100%;
        height: 100%;
        display: block;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
        image-rendering: pixelated;
      }

      .gr-card-footer {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 0 2px;
      }

      .gr-theme-icon {
        font-size: 13px;
        line-height: 1;
        flex-shrink: 0;
      }

      .gr-theme-name {
        font-size: 11.5px;
        font-weight: 600;
        color: #f1f5f9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Botão Discreto da Setinha */
      .gr-arrow-btn {
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 46px;
        height: 24px;
        border-radius: 999px;
        background: rgba(10, 22, 38, 0.72);
        backdrop-filter: blur(14px) saturate(150%);
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        border: 1px solid rgba(255, 255, 255, 0.25);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.20);
        color: rgba(241, 245, 249, 0.92);
        cursor: pointer;
        outline: none;
        transition: all 0.22s ease;
      }

      .gr-arrow-btn:hover {
        background: rgba(22, 46, 78, 0.88);
        border-color: rgba(125, 211, 252, 0.65);
        color: #ffffff;
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(56, 189, 248, 0.32);
      }

      .gr-arrow-btn svg {
        width: 16px;
        height: 16px;
        transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .gr-arrow-btn.open svg {
        transform: rotate(180deg);
      }

      /* Dock no Canto Inferior Direito (Botão do Relógio + Botão GitHub) */
      .gr-corner-dock {
        position: fixed;
        right: 18px;
        bottom: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: auto;
      }

      .gr-dock-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(10, 22, 38, 0.72);
        backdrop-filter: blur(16px) saturate(150%);
        -webkit-backdrop-filter: blur(16px) saturate(150%);
        border: 1px solid rgba(255, 255, 255, 0.22);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.18);
        color: rgba(241, 245, 249, 0.9);
        font-size: 11.5px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        outline: none;
        transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .gr-dock-btn:hover {
        background: rgba(22, 46, 78, 0.88);
        border-color: rgba(125, 211, 252, 0.65);
        color: #ffffff;
        transform: translateY(-2px);
        box-shadow: 0 8px 22px rgba(56, 189, 248, 0.28);
      }

      .gr-dock-btn.active {
        border-color: rgba(125, 211, 252, 0.55);
        color: #ffffff;
      }

      .gr-dock-btn.icon-only {
        width: 34px;
        padding: 0;
      }

      .gr-dock-btn svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .gr-clock-state-pill {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(56, 189, 248, 0.18);
        color: #7dd3fc;
      }

      .gr-dock-btn:not(.active) .gr-clock-state-pill {
        background: rgba(255, 255, 255, 0.10);
        color: rgba(203, 213, 225, 0.75);
      }
    `;

    const wrapper = document.createElement('div');
    wrapper.className = 'gr-anchor';

    const panel = document.createElement('div');
    panel.className = 'gr-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Configurações Visuais Gemini Reimagined');

    // Header
    const header = document.createElement('div');
    header.className = 'gr-panel-header';
    header.innerHTML = `
      <span class="gr-panel-title">✨ Gemini Reimagined Studio</span>
      <span class="gr-badge">Pixel Art & Glass UI</span>
    `;
    panel.appendChild(header);

    // Linha Superior (Fonte + Slider lado a lado)
    const controlsRow = document.createElement('div');
    controlsRow.className = 'gr-controls-row';

    // 1. Seletor de Fonte
    const fontField = document.createElement('div');
    fontField.className = 'gr-field';
    fontField.innerHTML = `
      <div class="gr-label-row">
        <label class="gr-label" for="gr-font-select">Fonte do Chat</label>
      </div>
    `;
    const fontSelect = document.createElement('select');
    fontSelect.id = 'gr-font-select';
    fontSelect.className = 'gr-select';
    FONT_OPTIONS.forEach((opt) => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.id;
      optionEl.textContent = opt.label;
      if (opt.id === state.prefs.fontFamily) optionEl.selected = true;
      fontSelect.appendChild(optionEl);
    });
    fontSelect.addEventListener('change', (e) => {
      state.prefs.fontFamily = e.target.value;
      applyTypographyVariables();
      savePreferences();
    });
    fontField.appendChild(fontSelect);

    // 2. Slider para Tamanho da Fonte (14px a 22px)
    const sizeField = document.createElement('div');
    sizeField.className = 'gr-field';
    const sizeLabelRow = document.createElement('div');
    sizeLabelRow.className = 'gr-label-row';
    const sizeLabel = document.createElement('label');
    sizeLabel.className = 'gr-label';
    sizeLabel.htmlFor = 'gr-size-slider';
    sizeLabel.textContent = 'Tamanho do Texto';
    const sizeValuePill = document.createElement('span');
    sizeValuePill.className = 'gr-value-pill';
    sizeValuePill.textContent = `${state.prefs.fontSize}px`;
    sizeLabelRow.appendChild(sizeLabel);
    sizeLabelRow.appendChild(sizeValuePill);

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'gr-slider-wrap';
    const sizeSlider = document.createElement('input');
    sizeSlider.id = 'gr-size-slider';
    sizeSlider.type = 'range';
    sizeSlider.className = 'gr-slider';
    sizeSlider.min = '14';
    sizeSlider.max = '22';
    sizeSlider.step = '1';
    sizeSlider.value = String(state.prefs.fontSize);
    sizeSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      state.prefs.fontSize = val;
      sizeValuePill.textContent = `${val}px`;
      applyTypographyVariables();
      savePreferences();
    });
    sliderWrap.appendChild(sizeSlider);

    sizeField.appendChild(sizeLabelRow);
    sizeField.appendChild(sliderWrap);

    controlsRow.appendChild(fontField);
    controlsRow.appendChild(sizeField);
    panel.appendChild(controlsRow);

    // 3. Seletor de Temas com Quadradinhos de Preview em Pixel Art
    const themeField = document.createElement('div');
    themeField.className = 'gr-field';
    themeField.innerHTML = `
      <div class="gr-label-row">
        <span class="gr-label">Ambientes em Pixel Art (Clique para transformar)</span>
      </div>
    `;
    const themeGrid = document.createElement('div');
    themeGrid.className = 'gr-theme-grid';

    const availableThemes = window.GeminiWallpaperEngine
      ? window.GeminiWallpaperEngine.getThemes()
      : [];

    const themeButtons = [];
    previewControllers = [];

    availableThemes.forEach((t) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'gr-theme-card' + (t.id === state.prefs.theme ? ' active' : '');
      card.dataset.themeId = t.id;
      card.title = t.label;

      const previewBox = document.createElement('div');
      previewBox.className = 'gr-preview-box';

      const previewCanvas = document.createElement('canvas');
      previewCanvas.className = 'gr-preview-canvas';
      previewCanvas.width = 96;
      previewCanvas.height = 58;
      previewBox.appendChild(previewCanvas);

      const footer = document.createElement('div');
      footer.className = 'gr-card-footer';
      footer.innerHTML = `
        <span class="gr-theme-icon">${t.icon}</span>
        <span class="gr-theme-name">${t.shortLabel || t.label}</span>
      `;

      card.appendChild(previewBox);
      card.appendChild(footer);

      if (window.GeminiWallpaperEngine) {
        const ctrl = window.GeminiWallpaperEngine.createPreviewInstance(t.id, previewCanvas);
        if (ctrl) previewControllers.push(ctrl);
      }

      card.addEventListener('click', () => {
        state.prefs.theme = t.id;
        themeButtons.forEach((b) => b.classList.toggle('active', b.dataset.themeId === t.id));
        if (window.GeminiWallpaperEngine) {
          window.GeminiWallpaperEngine.setTheme(t.id, true);
        }
        savePreferences();
      });

      themeButtons.push(card);
      themeGrid.appendChild(card);
    });

    themeField.appendChild(themeGrid);
    panel.appendChild(themeField);

    // Botão da Setinha
    const arrowBtn = document.createElement('button');
    arrowBtn.type = 'button';
    arrowBtn.className = 'gr-arrow-btn';
    arrowBtn.title = 'Personalizar Gemini (Fonte & Ambientes)';
    arrowBtn.setAttribute('aria-label', 'Abrir opções de personalização');
    arrowBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="18 15 12 9 6 15"></polyline>
      </svg>
    `;

    arrowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(!state.isMenuOpen);
    });

    wrapper.appendChild(panel);
    wrapper.appendChild(arrowBtn);

    // Dock no Canto Inferior Direito (Relógio de 3 Estados + Botão GitHub)
    const cornerDock = document.createElement('div');
    cornerDock.className = 'gr-corner-dock';

    // Botão do Relógio (3 estados: Desativado, Hora+Min, Hora+Min+Seg)
    const clockBtn = document.createElement('button');
    clockBtn.type = 'button';
    clockBtn.className = 'gr-dock-btn';
    clockBtn.setAttribute('aria-label', 'Alternar formato do relógio na tela inicial');
    const clockBadge = document.createElement('span');
    clockBadge.className = 'gr-clock-state-pill';
    clockBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <polyline points="12 7 12 12 15.5 14"></polyline>
      </svg>
    `;
    clockBtn.appendChild(clockBadge);
    clockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleClockMode();
    });

    // Botão com o Ícone Oficial do GitHub -> Repositório do Projeto
    const infoLink = document.createElement('a');
    infoLink.className = 'gr-dock-btn icon-only';
    infoLink.href = GITHUB_REPO_URL;
    infoLink.target = '_blank';
    infoLink.rel = 'noopener noreferrer';
    infoLink.title = 'Repositório no GitHub — carlosmontelima/gemini-reimagined';
    infoLink.setAttribute('aria-label', 'Abrir repositório do projeto no GitHub');
    infoLink.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
      </svg>
    `;

    cornerDock.appendChild(clockBtn);
    cornerDock.appendChild(infoLink);

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(wrapper);
    shadowRoot.appendChild(cornerDock);
    document.body.appendChild(hostEl);

    uiRefs = {
      wrapper,
      panel,
      arrowBtn,
      fontSelect,
      sizeSlider,
      sizeValuePill,
      themeButtons,
      clockBtn,
      clockBadge
    };

    syncClockButtonUI();
  }

  function toggleMenu(open) {
    state.isMenuOpen = Boolean(open);
    if (uiRefs.panel && uiRefs.arrowBtn) {
      uiRefs.panel.classList.toggle('open', state.isMenuOpen);
      uiRefs.arrowBtn.classList.toggle('open', state.isMenuOpen);
    }
    if (state.isMenuOpen) {
      startPreviewAnimationLoop();
    } else {
      stopPreviewAnimationLoop();
    }
  }

  function syncMenuControlsWithPrefs() {
    if (!uiRefs.fontSelect) return;
    uiRefs.fontSelect.value = state.prefs.fontFamily;
    uiRefs.sizeSlider.value = String(state.prefs.fontSize);
    uiRefs.sizeValuePill.textContent = `${state.prefs.fontSize}px`;
    uiRefs.themeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeId === state.prefs.theme);
    });
    syncClockButtonUI();
  }

  // ==========================================================================
  // 8. Listeners Globais (Fechamento do Menu, Resize e SPA Observer)
  // ==========================================================================
  function setupEventListeners() {
    window.addEventListener(
      'resize',
      () => {
        syncArrowPositionWithInput();
      },
      { passive: true }
    );

    document.addEventListener(
      'mousedown',
      (e) => {
        if (!state.isMenuOpen) return;
        if (hostEl && (e.target === hostEl || hostEl.contains(e.target))) return;
        toggleMenu(false);
      },
      { passive: true }
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && state.isMenuOpen) {
          toggleMenu(false);
        }
      },
      { passive: true }
    );

    let observerTimeout = null;
    const observer = new MutationObserver(() => {
      if (observerTimeout) return;
      observerTimeout = setTimeout(() => {
        observerTimeout = null;
        syncArrowPositionWithInput();
        ensureInputLivePreviewAttached();
        syncHomeClock();
        if (window.GeminiWallpaperEngine) {
          window.GeminiWallpaperEngine.ensureMounted();
        }
      }, 200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ==========================================================================
  // 9. Inicialização
  // ==========================================================================
  function init() {
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }

    injectGoogleFonts();

    loadPreferences((prefs) => {
      applyTypographyVariables();

      if (window.GeminiWallpaperEngine) {
        window.GeminiWallpaperEngine.onThemeChange((theme) => {
          updateGeminiBrandingForTheme(theme);
        });
        window.GeminiWallpaperEngine.mount(prefs.theme);
      }

      buildShadowMenu();
      syncMenuControlsWithPrefs();
      syncArrowPositionWithInput();
      ensureInputLivePreviewAttached();
      startClockTicker();
      setupEventListeners();
    });
  }

  init();
})();
