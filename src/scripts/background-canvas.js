/**
 * ============================================================================
 * Gemini Reimagined — Pixel Art Wallpaper Engine (background-canvas.js)
 * ============================================================================
 *
 * COMO ADICIONAR UM NOVO TEMA NO FUTURO:
 * Basta chamar `window.GeminiWallpaperEngine.registerTheme({ ... })` no final
 * deste arquivo. O Menu da Setinha (incluindo o quadradinho de preview em pixel art),
 * a animação de transição/mesclagem entre ambientes, a logo do Gemini e o sistema
 * de Glassmorphism detectarão o novo tema automaticamente!
 * ============================================================================
 */

(function () {
  'use strict';

  if (window.GeminiWallpaperEngine) return;

  // Matriz Bayer 4x4 normalizada (0..15) para dithering autêntico de Pixel Art Moderna
  const BAYER_4X4 = [
    [0,  8,  2, 10],
    [12, 4, 14,  6],
    [3, 11,  1,  9],
    [15, 7, 13,  5]
  ];

  // Utilitários compartilhados de Pixel Art (disponíveis para qualquer tema via `utils`)
  const PixelUtils = {
    createBuffer(w, h) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(w));
      c.height = Math.max(1, Math.floor(h));
      const ctx = c.getContext('2d', { alpha: true });
      ctx.imageSmoothingEnabled = false;
      return { canvas: c, ctx };
    },

    spriteFromMatrix(rows, palette, scale = 1) {
      const h = rows.length;
      const w = rows.reduce((max, r) => Math.max(max, r.length), 0);
      const { canvas, ctx } = this.createBuffer(w * scale, h * scale);

      for (let y = 0; y < h; y++) {
        const row = rows[y];
        for (let x = 0; x < row.length; x++) {
          const ch = row[x];
          if (ch === '.' || ch === ' ') continue;
          const color = palette[ch];
          if (!color) continue;
          ctx.fillStyle = color;
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
      return canvas;
    },

    flipSpriteH(sourceCanvas) {
      const { canvas, ctx } = this.createBuffer(sourceCanvas.width, sourceCanvas.height);
      ctx.translate(sourceCanvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sourceCanvas, 0, 0);
      return canvas;
    },

    hexToRgb(hex) {
      const clean = hex.replace('#', '');
      const num = parseInt(clean, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    },

    lerpRgb(c1, c2, t) {
      const clamped = Math.max(0, Math.min(1, t));
      return {
        r: Math.round(c1.r + (c2.r - c1.r) * clamped),
        g: Math.round(c1.g + (c2.g - c1.g) * clamped),
        b: Math.round(c1.b + (c2.b - c1.b) * clamped)
      };
    },

    createDitheredGradient(width, height, hexStops, stepsPerSegment = 6, startY = 0, endY = null) {
      const targetH = endY !== null ? endY - startY : height;
      const { canvas, ctx } = this.createBuffer(width, height);
      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;

      const rgbStops = hexStops.map((h) => this.hexToRgb(h));
      const segments = Math.max(1, rgbStops.length - 1);
      const totalBands = segments * stepsPerSegment;

      for (let y = startY; y < startY + targetH && y < height; y++) {
        const normY = (y - startY) / Math.max(1, targetH - 1);
        const scaledBand = normY * totalBands;
        const bandIndex = Math.min(totalBands - 1, Math.floor(scaledBand));
        const bandFrac = scaledBand - bandIndex;

        const t1 = bandIndex / totalBands;
        const t2 = Math.min(1, (bandIndex + 1) / totalBands);

        const seg1 = Math.min(segments - 1, Math.floor(t1 * segments));
        const localT1 = (t1 * segments) - seg1;
        const colA = this.lerpRgb(rgbStops[seg1], rgbStops[seg1 + 1], localT1);

        const seg2 = Math.min(segments - 1, Math.floor(t2 * segments));
        const localT2 = (t2 * segments) - seg2;
        const colB = this.lerpRgb(rgbStops[seg2], rgbStops[seg2 + 1], localT2);

        const bayerRow = BAYER_4X4[y & 3];

        for (let x = 0; x < width; x++) {
          const threshold = (bayerRow[x & 3] + 0.5) / 16;
          const chosen = bandFrac > threshold ? colB : colA;
          const idx = (y * width + x) * 4;
          data[idx] = chosen.r;
          data[idx + 1] = chosen.g;
          data[idx + 2] = chosen.b;
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      return canvas;
    },

    rand(min, max) {
      return min + Math.random() * (max - min);
    },

    randInt(min, max) {
      return Math.floor(this.rand(min, max + 1));
    }
  };

  // ==========================================================================
  // Engine Principal do Canvas (Gerencia Ciclo de Vida, Transição, Previews)
  // ==========================================================================
  const themesRegistry = new Map();
  const themeChangeListeners = new Set();

  let canvasEl = null;
  let ctx = null;
  let currentThemeId = 'ocean';
  let currentThemeState = null;

  // Estado de Transição (mesclagem suave entre dois temas)
  let transition = null;

  let internalWidth = 360;
  let internalHeight = 200;
  let rafId = null;
  let isRunning = false;
  let lastFrameTime = 0;
  let elapsedTime = 0;
  let resizeTimer = null;

  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  const BASE_PIXEL_HEIGHT = 200;
  const TRANSITION_DURATION = 1.15; // Segundos da transição de mesclagem

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function applyThemeGlassVariables(theme) {
    if (!theme) return;
    const root = document.documentElement;
    if (theme.glassVars) {
      Object.entries(theme.glassVars).forEach(([prop, value]) => {
        root.style.setProperty(prop, value);
      });
    }
    root.setAttribute('data-gr-theme', theme.id);

    // Notifica listeners (como o atualizador de logo/favicon no content.js)
    themeChangeListeners.forEach((fn) => {
      try {
        fn(theme);
      } catch (_) {}
    });
  }

  function computeInternalResolution() {
    const vw = Math.max(320, window.innerWidth || 1280);
    const vh = Math.max(240, window.innerHeight || 720);
    const aspect = vw / vh;
    internalHeight = BASE_PIXEL_HEIGHT;
    internalWidth = Math.max(180, Math.round(BASE_PIXEL_HEIGHT * aspect));

    if (canvasEl) {
      canvasEl.width = internalWidth;
      canvasEl.height = internalHeight;
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
      }
    }
  }

  function initActiveTheme() {
    const theme = themesRegistry.get(currentThemeId) || themesRegistry.values().next().value;
    if (!theme || !ctx) return;
    transition = null;
    applyThemeGlassVariables(theme);
    currentThemeState = theme.init(internalWidth, internalHeight, PixelUtils);
    theme.render(ctx, currentThemeState, elapsedTime, internalWidth, internalHeight, PixelUtils);
  }

  /**
   * Renderiza a mesclagem e transformação entre o tema anterior e o novo tema
   */
  function renderThemeTransition(dt) {
    const tr = transition;
    if (!tr) return;

    tr.progress = Math.min(1, tr.progress + dt / tr.duration);
    const eased = easeInOutCubic(tr.progress);

    // Atualiza e desenha ambos os temas em seus buffers offscreen
    tr.fromTheme.update(tr.fromState, dt, elapsedTime, internalWidth, internalHeight, PixelUtils);
    tr.fromTheme.render(tr.fromBuffer.ctx, tr.fromState, elapsedTime, internalWidth, internalHeight, PixelUtils);

    tr.toTheme.update(tr.toState, dt, elapsedTime, internalWidth, internalHeight, PixelUtils);
    tr.toTheme.render(tr.toBuffer.ctx, tr.toState, elapsedTime, internalWidth, internalHeight, PixelUtils);

    // 1. Desenha o ambiente antigo como base
    ctx.globalAlpha = 1;
    ctx.drawImage(tr.fromBuffer.canvas, 0, 0);

    // 2. Camada de mesclagem contínua (cross-fade suave)
    ctx.save();
    ctx.globalAlpha = eased;
    ctx.drawImage(tr.toBuffer.canvas, 0, 0);
    ctx.restore();

    // 3. Onda de transformação em fatias horizontais pixeladas + partículas de transição
    const waveFrontY = Math.round((1 - eased) * (internalHeight + 28)) - 14;
    const bandHeight = 24;

    for (let y = 0; y < internalHeight; y += 2) {
      const distFromWave = y - waveFrontY;
      if (distFromWave > bandHeight) {
        // Região já totalmente transformada
        ctx.drawImage(tr.toBuffer.canvas, 0, y, internalWidth, 2, 0, y, internalWidth, 2);
      } else if (distFromWave > -bandHeight) {
        // Zona de fusão com ondulação senoidal
        const localT = (distFromWave + bandHeight) / (bandHeight * 2);
        const shiftX = Math.round(Math.sin(y * 0.18 + elapsedTime * 10) * (1 - Math.abs(localT - 0.5) * 2) * 3);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, localT));
        ctx.drawImage(tr.toBuffer.canvas, 0, y, internalWidth, 2, shiftX, y, internalWidth, 2);
        ctx.restore();
      }
    }

    // Brilho sutil na crista da onda de transformação
    if (tr.progress > 0.05 && tr.progress < 0.95) {
      const glowColor = (tr.toTheme.brand && tr.toTheme.brand.primary) || '#7dd3fc';
      ctx.save();
      ctx.fillStyle = glowColor;
      ctx.globalAlpha = Math.sin(tr.progress * Math.PI) * 0.35;
      for (let x = 0; x < internalWidth; x += 4) {
        const wy = waveFrontY + Math.round(Math.sin(x * 0.08 + elapsedTime * 8) * 3);
        ctx.fillRect(x, wy, 2, 1);
      }
      ctx.restore();
    }

    if (tr.progress >= 1) {
      currentThemeState = tr.toState;
      transition = null;
    }
  }

  function tick(now) {
    if (!isRunning) return;
    rafId = requestAnimationFrame(tick);

    const deltaMs = now - lastFrameTime;
    if (deltaMs < FRAME_INTERVAL) return;

    const dt = Math.min(0.1, deltaMs / 1000);
    lastFrameTime = now - (deltaMs % FRAME_INTERVAL);
    elapsedTime += dt;

    if (!ctx) return;

    if (transition) {
      renderThemeTransition(dt);
      return;
    }

    const theme = themesRegistry.get(currentThemeId);
    if (!theme || !currentThemeState) return;

    theme.update(currentThemeState, dt, elapsedTime, internalWidth, internalHeight, PixelUtils);
    theme.render(ctx, currentThemeState, elapsedTime, internalWidth, internalHeight, PixelUtils);
  }

  function startLoop() {
    if (isRunning || document.hidden) return;
    isRunning = true;
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    isRunning = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopLoop();
    } else {
      startLoop();
    }
  }

  function handleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const oldW = internalWidth;
      const oldH = internalHeight;
      computeInternalResolution();
      if (oldW !== internalWidth || oldH !== internalHeight) {
        initActiveTheme();
      }
    }, 150);
  }

  const GeminiWallpaperEngine = {
    registerTheme(themeDef) {
      if (!themeDef || !themeDef.id) return;
      themesRegistry.set(themeDef.id, themeDef);
    },

    getThemes() {
      return Array.from(themesRegistry.values()).map((t) => ({
        id: t.id,
        label: t.label,
        shortLabel: t.shortLabel || t.label,
        icon: t.icon || '✨',
        brand: t.brand || {
          primary: '#38bdf8',
          secondary: '#818cf8',
          bg: '#0f172a'
        }
      }));
    },

    getThemeById(themeId) {
      return themesRegistry.get(themeId) || null;
    },

    onThemeChange(callback) {
      if (typeof callback === 'function') {
        themeChangeListeners.add(callback);
      }
    },

    mount(initialThemeId) {
      if (initialThemeId && themesRegistry.has(initialThemeId)) {
        currentThemeId = initialThemeId;
      } else if (!themesRegistry.has(currentThemeId) && themesRegistry.size > 0) {
        currentThemeId = themesRegistry.keys().next().value;
      }

      canvasEl = document.getElementById('gr-pixel-wallpaper');
      if (!canvasEl) {
        canvasEl = document.createElement('canvas');
        canvasEl.id = 'gr-pixel-wallpaper';
        canvasEl.setAttribute('aria-hidden', 'true');
        document.body.prepend(canvasEl);
      }

      ctx = canvasEl.getContext('2d', { alpha: false });
      ctx.imageSmoothingEnabled = false;

      computeInternalResolution();
      initActiveTheme();

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

      window.removeEventListener('resize', handleResize);
      window.addEventListener('resize', handleResize, { passive: true });

      startLoop();
    },

    /**
     * Troca de tema disparando a animação de transição/mesclagem entre ambientes
     */
    setTheme(themeId, animate = true) {
      if (!themesRegistry.has(themeId)) return;
      if (themeId === currentThemeId && !transition) return;

      const prevTheme = themesRegistry.get(currentThemeId);
      const nextTheme = themesRegistry.get(themeId);
      currentThemeId = themeId;

      if (!animate || !prevTheme || !currentThemeState || !ctx) {
        initActiveTheme();
        return;
      }

      applyThemeGlassVariables(nextTheme);

      const fromBuffer = PixelUtils.createBuffer(internalWidth, internalHeight);
      const toBuffer = PixelUtils.createBuffer(internalWidth, internalHeight);
      const nextState = nextTheme.init(internalWidth, internalHeight, PixelUtils);

      transition = {
        fromTheme: prevTheme,
        fromState: currentThemeState,
        fromBuffer,
        toTheme: nextTheme,
        toState: nextState,
        toBuffer,
        progress: 0,
        duration: TRANSITION_DURATION
      };
    },

    /**
     * Cria um controlador de mini-preview em Pixel Art para um card no Menu da Setinha
     */
    createPreviewInstance(themeId, previewCanvas) {
      const theme = themesRegistry.get(themeId);
      if (!theme || !previewCanvas) return null;

      const pw = previewCanvas.width || 96;
      const ph = previewCanvas.height || 58;
      const pCtx = previewCanvas.getContext('2d', { alpha: false });
      pCtx.imageSmoothingEnabled = false;

      const state = theme.init(pw, ph, PixelUtils);
      let localTime = 10; // Começa em um instante visualmente rico
      theme.update(state, 0.05, localTime, pw, ph, PixelUtils);
      theme.render(pCtx, state, localTime, pw, ph, PixelUtils);

      return {
        step(dt) {
          localTime += dt;
          theme.update(state, dt, localTime, pw, ph, PixelUtils);
          theme.render(pCtx, state, localTime, pw, ph, PixelUtils);
        }
      };
    },

    getCurrentThemeId() {
      return currentThemeId;
    },

    ensureMounted() {
      if (!document.body) return;
      const existing = document.getElementById('gr-pixel-wallpaper');
      if (!existing && canvasEl) {
        document.body.prepend(canvasEl);
      }
    }
  };

  window.GeminiWallpaperEngine = GeminiWallpaperEngine;

  // ==========================================================================
  // TEMA 1: OCEAN (Fundo do Mar — Pixel Art Moderna)
  // ==========================================================================
  GeminiWallpaperEngine.registerTheme({
    id: 'ocean',
    label: 'Fundo do Mar (Ocean)',
    shortLabel: 'Ocean',
    icon: '🌊',
    brand: {
      primary: '#38bdf8',
      secondary: '#2dd4bf',
      bg: '#062840'
    },
    glassVars: {
      '--gr-glass-bg': 'rgba(6, 22, 38, 0.72)',
      '--gr-glass-bg-strong': 'rgba(4, 17, 31, 0.84)',
      '--gr-glass-bg-subtle': 'rgba(8, 28, 48, 0.62)',
      '--gr-glass-bg-hover': 'rgba(16, 48, 78, 0.78)',
      '--gr-glass-border': 'rgba(94, 214, 255, 0.24)',
      '--gr-glass-border-strong': 'rgba(125, 232, 255, 0.42)',
      '--gr-accent-glow': 'rgba(34, 211, 238, 0.26)',
      '--gr-scrollbar-thumb': 'rgba(94, 214, 255, 0.32)',
      '--gr-scrollbar-thumb-hover': 'rgba(125, 232, 255, 0.58)'
    },

    init(w, h, utils) {
      const bgCanvas = utils.createDitheredGradient(
        w,
        h,
        ['#0f5476', '#0a3d5c', '#072b47', '#051d34', '#031222'],
        7
      );

      const fishTemplates = [
        {
          speedRange: [14, 24],
          depth: 'mid',
          palette: {
            o: '#1a1026',
            b: '#ff6b4a',
            h: '#ffaa5c',
            y: '#ffe07d',
            s: '#c43c35',
            w: '#ffffff',
            f: '#ff8552'
          },
          frameA: [
            '....hhhhh.....',
            '..hhbbbbbh....',
            '.fbbbbbbbbyh..',
            'ffbbbyyybbbow.',
            '.fssbbbbbbbbo.',
            '..fssssssbbo..',
            '....ff..ff....'
          ],
          frameB: [
            '....hhhhh.....',
            '.fhhbbbbbh....',
            '..bbbbbbbbyh..',
            '.fbbbyyybbbow.',
            'ffssbbbbbbbbo.',
            '..fssssssbbo..',
            '.....ff..ff...'
          ]
        },
        {
          speedRange: [18, 30],
          depth: 'front',
          palette: {
            c: '#5ce6ff',
            b: '#1ca3de',
            s: '#0d5c91',
            y: '#ffd166',
            o: '#061a2e',
            w: '#e8fcff'
          },
          frameA: [
            '...ccccc...',
            '.yybbbbbcw.',
            'yybbbbbbbo.',
            '.yyssssss..',
            '....ss.....'
          ],
          frameB: [
            '...ccccc...',
            '..ybbbbbcw.',
            '.yybbbbbbo.',
            '..yssssss..',
            '...ss......'
          ]
        },
        {
          speedRange: [9, 16],
          depth: 'mid',
          palette: {
            p: '#ff7eb6',
            v: '#a855f7',
            d: '#581c87',
            l: '#ffd6eb',
            o: '#140926',
            w: '#ffffff'
          },
          frameA: [
            '.....ll......',
            '....lppv.....',
            '...lpdppv....',
            '.pvppdvpppw..',
            'ppvppdvpppvo.',
            '.pvdddvppvv..',
            '...dvppv.....',
            '....dvv......',
            '.....d.......'
          ],
          frameB: [
            '....ll.......',
            '....lppv.....',
            '...lpdppv....',
            'ppvppdvpppw..',
            '.pvppdvpppvo.',
            'ppvdddvppvv..',
            '...dvppv.....',
            '....dvv......',
            '......d......'
          ]
        },
        {
          speedRange: [5, 9],
          depth: 'back',
          palette: {
            b: '#0c3554',
            s: '#08263e'
          },
          frameA: [
            '...bbbbb...',
            '.bbbbbbbbb.',
            'bbssssssssb',
            '.s..ssss...'
          ],
          frameB: [
            '...bbbbb...',
            '..bbbbbbbb.',
            '.bbsssssssb',
            '..s..ssss..'
          ]
        }
      ];

      const compiledFishSprites = fishTemplates.map((tpl) => {
        const rightA = utils.spriteFromMatrix(tpl.frameA, tpl.palette);
        const rightB = utils.spriteFromMatrix(tpl.frameB, tpl.palette);
        return {
          depth: tpl.depth,
          speedRange: tpl.speedRange,
          right: [rightA, rightB],
          left: [utils.flipSpriteH(rightA), utils.flipSpriteH(rightB)]
        };
      });

      const bubbleSprites = [
        utils.spriteFromMatrix(['.h', 'b.'], {
          h: 'rgba(215, 250, 255, 0.85)',
          b: 'rgba(110, 215, 255, 0.55)'
        }),
        utils.spriteFromMatrix(['.bb.', 'bhbb', 'b..b', '.bb.'], {
          h: 'rgba(240, 255, 255, 0.92)',
          b: 'rgba(120, 220, 255, 0.52)'
        }),
        utils.spriteFromMatrix(
          ['.bbbb.', 'bhh..b', 'bh...b', 'b....b', 'b...cb', '.bbbb.'],
          {
            h: 'rgba(255, 255, 255, 0.95)',
            b: 'rgba(130, 225, 255, 0.55)',
            c: 'rgba(80, 190, 240, 0.45)'
          }
        )
      ];

      const starfishPalettes = [
        { h: '#ff9e7d', m: '#ff6b52', s: '#b8332a', d: '#ffe3d8' },
        { h: '#ffd97d', m: '#f59e0b', s: '#9a5806', d: '#fff5d6' },
        { h: '#f0abfc', m: '#c026d3', s: '#701a75', d: '#fae8ff' }
      ];

      const starfishFrames = starfishPalettes.map((pal) => [
        utils.spriteFromMatrix(
          [
            '....h....',
            '...hmh...',
            'hhhmmdmhh',
            '.hmmddmm.',
            '..mmmmm..',
            '.hmmsmmh.',
            'hss...ssh'
          ],
          pal
        ),
        utils.spriteFromMatrix(
          [
            '....h....',
            '...hmh...',
            '.hhmmdmh.',
            'hhmmddmmh',
            '..mmmmm..',
            '.hmmsmmh.',
            '.ss...ss.'
          ],
          pal
        )
      ]);

      const coralTemplates = [
        {
          palette: { h: '#ff8da1', m: '#f43f5e', s: '#9f1239' },
          frameA: [
            '..h...h....h..',
            '.hmh.hmh..hmh.',
            '.hmh.hmh.hmmh.',
            '..hmmmmmhmmh..',
            '...smmmmmms...',
            '....smmmms....',
            '....ssssss....',
            '...ssssssss...'
          ],
          frameB: [
            '...h...h....h.',
            '..hmh.hmh..hmh',
            '.hmh..hmh.hmmh',
            '..hmmmmmhmmh..',
            '...smmmmmms...',
            '....smmmms....',
            '....ssssss....',
            '...ssssssss...'
          ]
        },
        {
          palette: { h: '#67e8f9', m: '#06b6d4', s: '#155e75' },
          frameA: [
            '.h..h..h..h.',
            'hmhhmhhmhhmh',
            'hmmmmmmmmmmh',
            '.smmmmmmmms.',
            '..smmmmmms..',
            '...ssssss...',
            '..ssssssss..'
          ],
          frameB: [
            '..h..h..h..h',
            '.hmhhmhhmhhm',
            'hmmmmmmmmmmh',
            '.smmmmmmmms.',
            '..smmmmmms..',
            '...ssssss...',
            '..ssssssss..'
          ]
        },
        {
          palette: { h: '#c084fc', m: '#9333ea', s: '#581c87', d: '#f3e8ff' },
          frameA: [
            '....dh...hd....',
            '...hmmh.hmmh...',
            '.dhhmmmmmhmdh..',
            'hmmmmmmmmmmmmh.',
            '.smmmmmmmmmms..',
            '...smmmmmms....',
            '....ssssss.....',
            '...ssssssss....'
          ],
          frameB: [
            '.....dh...hd...',
            '....hmmh.hmmh..',
            '..dhhmmmmmhmdh.',
            'hmmmmmmmmmmmmh.',
            '.smmmmmmmmmms..',
            '...smmmmmms....',
            '....ssssss.....',
            '...ssssssss....'
          ]
        }
      ];

      const coralSprites = coralTemplates.map((ct) => [
        utils.spriteFromMatrix(ct.frameA, ct.palette),
        utils.spriteFromMatrix(ct.frameB, ct.palette)
      ]);

      const { canvas: seabedCanvas, ctx: sbCtx } = utils.createBuffer(w, h);
      const groundBaseY = h - Math.max(12, Math.floor(h * 0.09));

      sbCtx.fillStyle = '#04182b';
      for (let x = 0; x < w; x++) {
        const hill = Math.sin(x * 0.035) * 5 + Math.cos(x * 0.08) * 2;
        const yTop = Math.round(groundBaseY - 7 + hill);
        sbCtx.fillRect(x, yTop, 1, h - yTop);
      }

      for (let x = 0; x < w; x++) {
        const wave = Math.sin(x * 0.05 + 1.2) * 3 + Math.sin(x * 0.14) * 1.5;
        const yTop = Math.round(groundBaseY + wave);
        sbCtx.fillStyle = '#0f3959';
        sbCtx.fillRect(x, yTop, 1, 2);
        sbCtx.fillStyle = '#08233a';
        sbCtx.fillRect(x, yTop + 2, 1, h - (yTop + 2));
      }

      const props = [];
      const slots = Math.max(4, Math.floor(w / 28));
      for (let i = 0; i < slots; i++) {
        const slotX = Math.round((i + 0.3 + Math.random() * 0.4) * (w / slots));
        const wave = Math.sin(slotX * 0.05 + 1.2) * 3 + Math.sin(slotX * 0.14) * 1.5;
        const surfaceY = Math.round(groundBaseY + wave);

        if (i % 2 === 0) {
          const frames = coralSprites[i % coralSprites.length];
          props.push({
            frames,
            x: slotX - Math.floor(frames[0].width / 2),
            y: surfaceY - frames[0].height + 3,
            phase: Math.random() * Math.PI * 2,
            speed: utils.rand(1.2, 2.2)
          });
        } else {
          const frames = starfishFrames[i % starfishFrames.length];
          props.push({
            frames,
            x: slotX - Math.floor(frames[0].width / 2),
            y: surfaceY - frames[0].height + 5,
            phase: Math.random() * Math.PI * 2,
            speed: utils.rand(0.7, 1.3)
          });
        }
      }

      const kelps = [];
      const kelpCount = Math.max(3, Math.floor(w / 40));
      for (let i = 0; i < kelpCount; i++) {
        kelps.push({
          x: Math.round(utils.rand(8, w - 8)),
          baseY: h - utils.randInt(3, 9),
          height: utils.randInt(12, Math.max(16, Math.floor(h * 0.16))),
          phase: utils.rand(0, Math.PI * 2),
          speed: utils.rand(1.4, 2.4),
          colorMain: i % 2 === 0 ? '#117864' : '#0e6251',
          colorHighlight: i % 2 === 0 ? '#45b39d' : '#1abc9c'
        });
      }

      const fishes = [];
      const fishCount = Math.max(5, Math.floor(w / 26));
      for (let i = 0; i < fishCount; i++) {
        const tpl = compiledFishSprites[i % compiledFishSprites.length];
        const dir = Math.random() > 0.5 ? 1 : -1;
        const speed = utils.rand(tpl.speedRange[0], tpl.speedRange[1]);
        fishes.push({
          tpl,
          dir,
          speed,
          x: utils.rand(-10, w + 10),
          baseY: utils.rand(14, Math.max(24, h - 30)),
          y: 0,
          bobAmp: utils.rand(1.0, 2.8),
          bobFreq: utils.rand(1.5, 3.0),
          animPhase: utils.rand(0, Math.PI * 2),
          animSpeed: speed * 0.25
        });
      }

      const bubbles = [];
      const bubbleCount = Math.max(8, Math.floor(w / 14));
      for (let i = 0; i < bubbleCount; i++) {
        const sizeIdx = Math.random() < 0.55 ? 0 : (Math.random() < 0.8 ? 1 : 2);
        bubbles.push({
          sprite: bubbleSprites[sizeIdx],
          baseX: utils.rand(4, w - 4),
          x: 0,
          y: utils.rand(0, h),
          speedY: utils.rand(8, 18) + sizeIdx * 3,
          swayAmp: utils.rand(1.2, 3.8),
          swayFreq: utils.rand(1.5, 3.2),
          phase: utils.rand(0, Math.PI * 2)
        });
      }

      const lightRays = [
        { x: w * 0.18, width: Math.max(8, Math.floor(w * 0.06)), phase: 0.2 },
        { x: w * 0.48, width: Math.max(10, Math.floor(w * 0.08)), phase: 1.7 },
        { x: w * 0.78, width: Math.max(8, Math.floor(w * 0.05)), phase: 3.1 }
      ];

      return { bgCanvas, seabedCanvas, props, kelps, fishes, bubbles, lightRays };
    },

    update(state, dt, time, w, h, utils) {
      for (let i = 0; i < state.fishes.length; i++) {
        const f = state.fishes[i];
        f.x += f.dir * f.speed * dt;
        f.y = f.baseY + Math.sin(time * f.bobFreq + f.animPhase) * f.bobAmp;

        const margin = 20;
        if (f.dir === 1 && f.x > w + margin) {
          f.x = -margin;
          f.baseY = utils.rand(14, Math.max(24, h - 30));
        } else if (f.dir === -1 && f.x < -margin) {
          f.x = w + margin;
          f.baseY = utils.rand(14, Math.max(24, h - 30));
        }
      }

      for (let i = 0; i < state.bubbles.length; i++) {
        const b = state.bubbles[i];
        b.y -= b.speedY * dt;
        b.x = b.baseX + Math.sin(time * b.swayFreq + b.phase) * b.swayAmp;
        if (b.y < -8) {
          b.y = h - utils.rand(4, 14);
          b.baseX = utils.rand(4, w - 4);
        }
      }
    },

    render(ctx, state, time, w, h) {
      ctx.drawImage(state.bgCanvas, 0, 0);

      for (let i = 0; i < state.lightRays.length; i++) {
        const ray = state.lightRays[i];
        const alpha = 0.035 + (Math.sin(time * 0.8 + ray.phase) * 0.5 + 0.5) * 0.035;
        ctx.fillStyle = `rgba(140, 235, 255, ${alpha.toFixed(3)})`;
        const rayHeight = Math.floor(h * 0.65);
        for (let ry = 0; ry < rayHeight; ry += 2) {
          const drift = Math.floor(ry * 0.22);
          const curW = Math.max(3, Math.floor(ray.width * (1 - ry / (rayHeight * 1.3))));
          ctx.fillRect(Math.round(ray.x + drift), ry, curW, 2);
        }
      }

      for (let i = 0; i < state.fishes.length; i++) {
        const f = state.fishes[i];
        if (f.tpl.depth !== 'back') continue;
        const frameIdx = Math.floor(time * f.animSpeed + f.animPhase) & 1;
        const sprite = f.dir === 1 ? f.tpl.right[frameIdx] : f.tpl.left[frameIdx];
        ctx.drawImage(sprite, Math.round(f.x), Math.round(f.y));
      }

      ctx.drawImage(state.seabedCanvas, 0, 0);

      for (let i = 0; i < state.kelps.length; i++) {
        const k = state.kelps[i];
        for (let seg = 0; seg < k.height; seg++) {
          const factor = seg / k.height;
          const sway = Math.round(Math.sin(time * k.speed + k.phase + factor * 2.4) * (factor * 3.0));
          ctx.fillStyle = seg % 3 === 0 ? k.colorHighlight : k.colorMain;
          ctx.fillRect(k.x + sway, k.baseY - seg, 2, 1);
        }
      }

      for (let i = 0; i < state.props.length; i++) {
        const p = state.props[i];
        const frameIdx = Math.floor(time * p.speed + p.phase) & 1;
        ctx.drawImage(p.frames[frameIdx], p.x, p.y);
      }

      for (let i = 0; i < state.fishes.length; i++) {
        const f = state.fishes[i];
        if (f.tpl.depth === 'back') continue;
        const frameIdx = Math.floor(time * f.animSpeed + f.animPhase) & 1;
        const sprite = f.dir === 1 ? f.tpl.right[frameIdx] : f.tpl.left[frameIdx];
        ctx.drawImage(sprite, Math.round(f.x), Math.round(f.y));
      }

      for (let i = 0; i < state.bubbles.length; i++) {
        const b = state.bubbles[i];
        ctx.drawImage(b.sprite, Math.round(b.x), Math.round(b.y));
      }
    }
  });

  // ==========================================================================
  // TEMA 2: SPACE (Espaço Cósmico — Pixel Art Moderna)
  // ==========================================================================
  GeminiWallpaperEngine.registerTheme({
    id: 'space',
    label: 'Espaço (Space)',
    shortLabel: 'Space',
    icon: '🪐',
    brand: {
      primary: '#c084fc',
      secondary: '#f472b6',
      bg: '#130d26'
    },
    glassVars: {
      '--gr-glass-bg': 'rgba(12, 10, 28, 0.72)',
      '--gr-glass-bg-strong': 'rgba(8, 7, 20, 0.85)',
      '--gr-glass-bg-subtle': 'rgba(16, 14, 38, 0.64)',
      '--gr-glass-bg-hover': 'rgba(32, 26, 70, 0.78)',
      '--gr-glass-border': 'rgba(192, 132, 252, 0.24)',
      '--gr-glass-border-strong': 'rgba(216, 180, 254, 0.42)',
      '--gr-accent-glow': 'rgba(168, 85, 247, 0.26)',
      '--gr-scrollbar-thumb': 'rgba(192, 132, 252, 0.32)',
      '--gr-scrollbar-thumb-hover': 'rgba(216, 180, 254, 0.58)'
    },

    init(w, h, utils) {
      const bgCanvas = utils.createDitheredGradient(
        w,
        h,
        ['#05050d', '#0a091b', '#120e2b', '#191236', '#0c091e'],
        7
      );

      const bgCtx = bgCanvas.getContext('2d');
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const wave = Math.sin(x * 0.018 + y * 0.025) + Math.cos(x * 0.01 - y * 0.02);
          if (wave > 1.15) {
            const bayer = (BAYER_4X4[y & 3][x & 3] + 0.5) / 16;
            if ((wave - 1.15) * 1.1 > bayer) {
              bgCtx.fillStyle = (x + y) % 2 === 0 ? 'rgba(124, 58, 237, 0.14)' : 'rgba(56, 189, 248, 0.10)';
              bgCtx.fillRect(x, y, 1, 1);
            }
          }
        }
      }

      const ringedPlanetLarge = utils.spriteFromMatrix(
        [
          '................rrrrrr................',
          '............rrrrLLLLLLrrrr............',
          '.........rrrLLhhhhhhhhhhLLrrr.........',
          '.......rrLLhhhhhhhhhhhhhhhhLLrr.......',
          '......rLLhhhhbbbbbbbbbbbbhhhhLLr......',
          '.....rLhhhbbbbbbbbbbbbbbbbbbhhhLr.....',
          '....rLhhbbbbbbmmmmmmmmmmbbbbbbhhLr....',
          '...rLhhbbbbmmmmmmmmmmmmmmmmbbbbhhLr...',
          '...rLhbbbmmmmmmddddddddmmmmmmbbbss....',
          '..rLhbbbmmmmddddddddddddddmmmmbbsss...',
          '..rLhbbmmmmddddddddddddddddmmmmbssss..',
          '..rLhbmmmmddddddssssssddddddmmmmssss..',
          '...rLLbmmmddddssssssssssddddmmmssss...',
          '....rrLLmmddddssssssssssddddmmLLrr....',
          '......rrLLLmddddssssssddddmLLLrr......',
          '........rrrLLLLLLLLLLLLLLLLrrr........',
          '...........rrrrLLLLLLLLrrrr...........',
          '...............rrrrrrrr...............'
        ],
        {
          h: '#ffd89b',
          b: '#f59e42',
          m: '#d95b43',
          d: '#8f2d56',
          s: '#3b173b',
          L: '#fef08a',
          r: '#ca8a04'
        }
      );

      const ringedPlanetMedium = utils.spriteFromMatrix(
        [
          '..................RRRRR...',
          '..............RRRRLLLLLR..',
          '.........ccccRLLLRhhhhR...',
          '.......ccccccchhhhbbLR....',
          '......cccccchhhhbbbbR.....',
          '.....ccccchhhhbbbbmmR.....',
          '....cccchhhhbbbbmmmmss....',
          '....ccchhhbbbbmmmmssss....',
          '....cchhbbbbmmmmssssss....',
          '....RLbbbbmmmmssssssss....',
          '...RLLLbmmmmsssssssss.....',
          '..RLLR..mmssssssssss......',
          '..RRRR....ssssssss........'
        ],
        {
          c: '#a5f3fc',
          h: '#38bdf8',
          b: '#0284c7',
          m: '#1e3a8a',
          s: '#0f172a',
          L: '#f5d0fe',
          R: '#a855f7'
        }
      );

      const miniRingedPlanet = utils.spriteFromMatrix(
        [
          '.......rrr..',
          '....hhhlllr.',
          '...hhhhbbll.',
          '..hhhbbbmms.',
          '.rllbbmmsss.',
          'rlll.mssss..',
          '.rr...sss...'
        ],
        {
          h: '#fde68a',
          b: '#f472b6',
          m: '#9333ea',
          s: '#311042',
          l: '#cbd5e1',
          r: '#64748b'
        }
      );

      const stars = [];
      const starColors = ['#ffffff', '#e0f2fe', '#fae8ff', '#fef3c7', '#c7d2fe'];
      const totalStars = Math.max(40, Math.floor((w * h) / 680));

      for (let i = 0; i < totalStars; i++) {
        const layer = i % 6 === 0 ? 2 : (i % 3 === 0 ? 1 : 0);
        const speed = layer === 0 ? 0.8 : (layer === 1 ? 1.8 : 3.2);
        stars.push({
          x: utils.rand(0, w),
          y: utils.rand(0, h),
          layer,
          speed,
          color: starColors[i % starColors.length],
          twinkleSpeed: utils.rand(1.5, 4.2),
          twinklePhase: utils.rand(0, Math.PI * 2),
          canSparkle: layer === 2 && i % 12 === 0
        });
      }

      const planets = [
        {
          sprite: miniRingedPlanet,
          x: w * 0.16,
          baseY: h * 0.2,
          speed: 1.4,
          bobAmp: 1.5,
          bobFreq: 0.4,
          phase: 0.5
        },
        {
          sprite: ringedPlanetMedium,
          x: w * 0.72,
          baseY: h * 0.62,
          speed: 2.3,
          bobAmp: 2.0,
          bobFreq: 0.5,
          phase: 2.1
        },
        {
          sprite: ringedPlanetLarge,
          x: w * 0.42,
          baseY: h * 0.32,
          speed: 3.4,
          bobAmp: 2.5,
          bobFreq: 0.35,
          phase: 1.2
        }
      ];

      return { bgCanvas, stars, planets };
    },

    update(state, dt, time, w, h, utils) {
      for (let i = 0; i < state.stars.length; i++) {
        const s = state.stars[i];
        s.x -= s.speed * dt;
        if (s.x < -2) {
          s.x = w + 2;
          s.y = utils.rand(0, h);
        }
      }

      for (let i = 0; i < state.planets.length; i++) {
        const p = state.planets[i];
        p.x -= p.speed * dt;
        const margin = p.sprite.width + 12;
        if (p.x < -margin) {
          p.x = w + margin;
        }
      }
    },

    render(ctx, state, time) {
      ctx.drawImage(state.bgCanvas, 0, 0);

      for (let i = 0; i < state.stars.length; i++) {
        const s = state.stars[i];
        const wave = Math.sin(time * s.twinkleSpeed + s.twinklePhase);
        if (wave < -0.65) continue;

        const sx = Math.round(s.x);
        const sy = Math.round(s.y);
        ctx.fillStyle = s.color;
        ctx.fillRect(sx, sy, 1, 1);

        if (s.canSparkle && wave > 0.55) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.fillRect(sx - 1, sy, 1, 1);
          ctx.fillRect(sx + 1, sy, 1, 1);
          ctx.fillRect(sx, sy - 1, 1, 1);
          ctx.fillRect(sx, sy + 1, 1, 1);
        }
      }

      for (let i = 0; i < state.planets.length; i++) {
        const p = state.planets[i];
        const py = p.baseY + Math.sin(time * p.bobFreq + p.phase) * p.bobAmp;
        ctx.drawImage(p.sprite, Math.round(p.x), Math.round(py));
      }
    }
  });

  // ==========================================================================
  // TEMA 3: SKY (Céu Azul Bebê com Nuvens em Pixel Art Moderna e Fade Out)
  // ==========================================================================
  GeminiWallpaperEngine.registerTheme({
    id: 'sky',
    label: 'Céu (Sky)',
    shortLabel: 'Sky',
    icon: '☁️',
    brand: {
      primary: '#7dd3fc',
      secondary: '#ffffff',
      bg: '#102a45'
    },
    glassVars: {
      // Fundo escuro translúcido com blur mais forte para leitura perfeita de letras brancas sobre o céu claro
      '--gr-glass-bg': 'rgba(11, 25, 44, 0.74)',
      '--gr-glass-bg-strong': 'rgba(8, 19, 35, 0.86)',
      '--gr-glass-bg-subtle': 'rgba(12, 28, 48, 0.68)',
      '--gr-glass-bg-hover': 'rgba(20, 44, 74, 0.82)',
      '--gr-glass-border': 'rgba(186, 230, 253, 0.34)',
      '--gr-glass-border-strong': 'rgba(224, 242, 254, 0.52)',
      '--gr-accent-glow': 'rgba(56, 189, 248, 0.30)',
      '--gr-scrollbar-thumb': 'rgba(15, 35, 60, 0.42)',
      '--gr-scrollbar-thumb-hover': 'rgba(15, 35, 60, 0.68)'
    },

    init(w, h, utils) {
      const bgCanvas = utils.createDitheredGradient(
        w,
        h,
        ['#62b4f6', '#7ec4fa', '#9bd4fd', '#b8e2ff', '#d6f0ff', '#eaf7ff'],
        7
      );

      const cloudPalette = {
        w: '#ffffff',
        c: '#f2f9ff',
        m: '#d5e9fa',
        s: '#b3d4f0'
      };

      const cloudSprites = [
        utils.spriteFromMatrix(
          [
            '..........wwwwww................',
            '........wwwwwwwwww....wwww......',
            '......wwwwccccccccwwwwwwwwww....',
            '....wwwwccccccccccccwwwwcccccc..',
            '...wwwccccccccccccccccccccccccw.',
            '..wwcccccccccccccccccccccccccccw',
            '.wwcccccccccmmmmmmmmcccccccccccc',
            '.wccccccmmmmmmmmmmmmmmmmcccccccm',
            'wccccmmmmmmmmmmmmmmmmmmmmmmcccmm',
            'mmmmmmmmmmssssssssssssmmmmmmmmms',
            '.ssssssssssssssssssssssssssssss.'
          ],
          cloudPalette
        ),
        utils.spriteFromMatrix(
          [
            '.......wwwwww............',
            '.....wwwwwwwwww...wwww...',
            '...wwwwccccccccwwwwwwww..',
            '..wwccccccccccccccccccw..',
            '.wwcccccccmmmmmmcccccccw.',
            'wcccccmmmmmmmmmmmmmmmmcc.',
            'mmmmmmmmssssssssmmmmmmmms',
            '.sssssssssssssssssssssss.'
          ],
          cloudPalette
        ),
        utils.spriteFromMatrix(
          [
            '....wwwwww....',
            '..wwwwwwwwww..',
            '.wwccccccccww.',
            'wwccccccmmmmcw',
            'mmmmmmssssmmmm',
            '.ssssssssssss.'
          ],
          cloudPalette
        ),
        utils.spriteFromMatrix(
          [
            '.....wwwwwwwwwww..........',
            '..wwwwcccccccccwwwwww.....',
            'wwwcccccccccccccccccwwww..',
            '.mmmmmmmmmmmmcccccccccccw.',
            '....ssssssssmmmmmmmmmmmms.'
          ],
          cloudPalette
        )
      ];

      const clouds = [];
      const cloudCount = Math.max(8, Math.floor(w / 24));

      for (let i = 0; i < cloudCount; i++) {
        const spriteIdx = i % cloudSprites.length;
        const sprite = cloudSprites[spriteIdx];
        const layerSpeed =
          spriteIdx === 0
            ? utils.rand(2.2, 4.0)
            : spriteIdx === 1
            ? utils.rand(4.2, 7.0)
            : spriteIdx === 2
            ? utils.rand(6.5, 10.5)
            : utils.rand(1.5, 3.0);

        clouds.push({
          sprite,
          x: utils.rand(-20, w + 10),
          y: utils.rand(6, Math.max(12, h - sprite.height - 10)),
          speed: layerSpeed,
          fades: i % 2 === 0,
          fadeSpeed: utils.rand(0.25, 0.55),
          fadePhase: utils.rand(0, Math.PI * 2),
          baseAlpha: spriteIdx === 3 ? 0.78 : 0.95
        });
      }

      return { bgCanvas, clouds };
    },

    update(state, dt, time, w, h, utils) {
      for (let i = 0; i < state.clouds.length; i++) {
        const c = state.clouds[i];
        c.x += c.speed * dt;
        const margin = c.sprite.width + 14;
        if (c.x > w + margin) {
          c.x = -margin;
          c.y = utils.rand(6, Math.max(12, h - c.sprite.height - 10));
        }
      }
    },

    render(ctx, state, time) {
      ctx.drawImage(state.bgCanvas, 0, 0);

      for (let i = 0; i < state.clouds.length; i++) {
        const c = state.clouds[i];
        let alpha = c.baseAlpha;
        if (c.fades) {
          const wave = Math.sin(time * c.fadeSpeed + c.fadePhase);
          alpha = Math.max(0, Math.min(1, (wave + 0.55) * 0.75)) * c.baseAlpha;
        }
        if (alpha <= 0.02) continue;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(c.sprite, Math.round(c.x), Math.round(c.y));
        ctx.restore();
      }
    }
  });

  // ==========================================================================
  // TEMA 4: DRACULA CASTLE (Castelo Negro, Janelas Iluminadas, Chuva, Raios e Morcegos)
  // ==========================================================================
  GeminiWallpaperEngine.registerTheme({
    id: 'dracula',
    label: 'Castelo do Drácula (Dracula Castle)',
    shortLabel: 'Dracula Castle',
    icon: '🧛',
    brand: {
      primary: '#f43f5e',
      secondary: '#a855f7',
      bg: '#140714'
    },
    glassVars: {
      '--gr-glass-bg': 'rgba(16, 8, 20, 0.75)',
      '--gr-glass-bg-strong': 'rgba(11, 5, 14, 0.88)',
      '--gr-glass-bg-subtle': 'rgba(20, 10, 26, 0.65)',
      '--gr-glass-bg-hover': 'rgba(40, 14, 36, 0.82)',
      '--gr-glass-border': 'rgba(244, 63, 94, 0.26)',
      '--gr-glass-border-strong': 'rgba(251, 113, 133, 0.45)',
      '--gr-accent-glow': 'rgba(225, 29, 72, 0.26)',
      '--gr-scrollbar-thumb': 'rgba(244, 63, 94, 0.34)',
      '--gr-scrollbar-thumb-hover': 'rgba(251, 113, 133, 0.60)'
    },

    init(w, h, utils) {
      // 1. Céu noturno gótico tempestuoso
      const bgCanvas = utils.createDitheredGradient(
        w,
        h,
        ['#07040d', '#11081c', '#1c0d29', '#291130', '#16081a'],
        6
      );

      // Lua cheia sangrenta/pálida no canto superior
      const bgCtx = bgCanvas.getContext('2d');
      const moonX = Math.floor(w * 0.76);
      const moonY = Math.floor(h * 0.22);
      const moonR = Math.max(10, Math.floor(h * 0.08));

      for (let dy = -moonR - 4; dy <= moonR + 4; dy++) {
        for (let dx = -moonR - 4; dx <= moonR + 4; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= moonR) {
            bgCtx.fillStyle = dist < moonR * 0.75 ? '#fecdd3' : '#fb7185';
            bgCtx.fillRect(moonX + dx, moonY + dy, 1, 1);
          } else if (dist <= moonR + 4) {
            bgCtx.fillStyle = 'rgba(244, 63, 94, 0.14)';
            bgCtx.fillRect(moonX + dx, moonY + dy, 1, 1);
          }
        }
      }

      // 2. Castelo Negro Gótico Imponente com Torres e Janelas Bonitas
      const { canvas: castleCanvas, ctx: cCtx } = utils.createBuffer(w, h);
      const castleCenterX = Math.floor(w * 0.5);
      const cliffTopY = Math.floor(h * 0.72);

      // Penhasco rochoso sombrio na base
      for (let x = 0; x < w; x++) {
        const distCenter = Math.abs(x - castleCenterX);
        const cliffProfile =
          distCenter < 52
            ? cliffTopY + Math.floor(Math.pow(distCenter / 52, 2) * 18)
            : h - 14 + Math.round(Math.sin(x * 0.07) * 5);
        cCtx.fillStyle = '#07050a';
        cCtx.fillRect(x, cliffProfile, 1, h - cliffProfile);
        cCtx.fillStyle = '#161020';
        cCtx.fillRect(x, cliffProfile, 1, 2);
      }

      // Função auxiliar para desenhar uma torre gótica com telhado pontiagudo e janelas em vitral
      const towerTips = [];
      function drawTower(tx, tw, baseH, roofH, windowRows) {
        const left = tx - Math.floor(tw / 2);
        const topY = cliffTopY - baseH;
        const tipY = topY - roofH;
        towerTips.push({ x: tx, y: tipY });

        // Corpo negro da torre com borda iluminada pelo luar
        cCtx.fillStyle = '#09070f';
        cCtx.fillRect(left, topY, tw, baseH + 10);
        cCtx.fillStyle = '#1f162b';
        cCtx.fillRect(left + tw - 2, topY, 2, baseH);

        // Ameias (merlões)
        for (let bx = left - 1; bx < left + tw + 1; bx += 3) {
          cCtx.fillStyle = '#09070f';
          cCtx.fillRect(bx, topY - 2, 2, 2);
        }

        // Telhado pontiagudo gótico
        for (let ry = 0; ry < roofH; ry++) {
          const ratio = ry / roofH;
          const curW = Math.max(1, Math.round((tw + 4) * ratio));
          const rx = tx - Math.floor(curW / 2);
          cCtx.fillStyle = '#0d0914';
          cCtx.fillRect(rx, tipY + ry, curW, 1);
          cCtx.fillStyle = '#2d1b3d';
          cCtx.fillRect(rx + curW - 1, tipY + ry, 1, 1);
        }
        // Pináculo no topo da torre
        cCtx.fillStyle = '#3b234a';
        cCtx.fillRect(tx, tipY - 4, 1, 4);

        // Janelas em arco gótico (vitrais iluminados)
        for (let r = 0; r < windowRows; r++) {
          const wy = topY + 7 + r * 14;
          if (wy + 7 >= cliffTopY) break;
          const wx = tx - 2;
          // Arco superior e corpo da janela
          cCtx.fillStyle = '#f43f5e';
          cCtx.fillRect(wx + 1, wy, 3, 1);
          cCtx.fillStyle = '#fbbf24';
          cCtx.fillRect(wx, wy + 1, 5, 5);
          cCtx.fillStyle = '#fef08a';
          cCtx.fillRect(wx + 1, wy + 1, 3, 3);
          // Grade gótica da janela
          cCtx.fillStyle = '#140a1c';
          cCtx.fillRect(wx + 2, wy + 1, 1, 5);
          cCtx.fillRect(wx, wy + 3, 5, 1);
        }
      }

      // Muralha central e salão principal
      cCtx.fillStyle = '#08060d';
      cCtx.fillRect(castleCenterX - 36, cliffTopY - 34, 72, 38);

      // Grande rosácea gótica no salão central
      const roseY = cliffTopY - 24;
      cCtx.fillStyle = '#e11d48';
      cCtx.fillRect(castleCenterX - 4, roseY - 3, 9, 7);
      cCtx.fillStyle = '#fbbf24';
      cCtx.fillRect(castleCenterX - 3, roseY - 2, 7, 5);
      cCtx.fillStyle = '#120817';
      cCtx.fillRect(castleCenterX, roseY - 3, 1, 7);
      cCtx.fillRect(castleCenterX - 4, roseY, 9, 1);

      // Torres laterais e torre mestre central
      drawTower(castleCenterX - 32, 13, 46, 18, 2);
      drawTower(castleCenterX - 16, 15, 62, 22, 3);
      drawTower(castleCenterX + 16, 15, 58, 20, 3);
      drawTower(castleCenterX + 32, 13, 44, 17, 2);
      drawTower(castleCenterX, 19, 80, 28, 4); // Torre principal mais alta

      // 3. Morceguinhos com Olhos Vermelhos (2 frames de bater de asas)
      const batPalette = {
        b: '#12091c', // asas negras/violeta-escuro
        h: '#2e1a47', // borda superior da asa
        r: '#ff1e42'  // olhinhos vermelhos brilhantes!
      };

      const batFrames = [
        utils.spriteFromMatrix(
          [
            'h.......h',
            'bh.b.b.hb',
            '.bbrbrbb.',
            '..bbbbb..',
            '...b.b...'
          ],
          batPalette
        ),
        utils.spriteFromMatrix(
          [
            '...b.b...',
            '..hbrbh..',
            '.bbbbbbb.',
            'bb..b..bb',
            'b.......b'
          ],
          batPalette
        )
      ];

      const bats = [];
      const batCount = Math.max(6, Math.floor(w / 42));
      for (let i = 0; i < batCount; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        bats.push({
          dir,
          x: utils.rand(0, w),
          baseY: utils.rand(14, Math.max(30, cliffTopY - 12)),
          speed: utils.rand(18, 32),
          waveAmp: utils.rand(3, 7),
          waveFreq: utils.rand(2.5, 4.5),
          phase: utils.rand(0, Math.PI * 2)
        });
      }

      // 4. Partículas de Chuva
      const raindrops = [];
      const rainCount = Math.max(45, Math.floor((w * h) / 700));
      for (let i = 0; i < rainCount; i++) {
        raindrops.push({
          x: utils.rand(0, w),
          y: utils.rand(0, h),
          speedY: utils.rand(110, 165),
          speedX: -28,
          len: utils.randInt(3, 6)
        });
      }

      // 5. Estado dos Raios (Relâmpagos no fundo e nas torres do castelo)
      const lightning = {
        timer: utils.rand(1.8, 3.8),
        activeTime: 0,
        duration: 0.28,
        segments: [],
        flashAlpha: 0
      };

      return {
        bgCanvas,
        castleCanvas,
        towerTips,
        batFrames,
        bats,
        raindrops,
        lightning
      };
    },

    update(state, dt, time, w, h, utils) {
      // Atualiza chuva
      for (let i = 0; i < state.raindrops.length; i++) {
        const r = state.raindrops[i];
        r.x += r.speedX * dt;
        r.y += r.speedY * dt;
        if (r.y > h + 6) {
          r.y = -6;
          r.x = utils.rand(-10, w + 30);
        }
        if (r.x < -10) {
          r.x = w + 10;
        }
      }

      // Atualiza morcegos de olhos vermelhos
      for (let i = 0; i < state.bats.length; i++) {
        const b = state.bats[i];
        b.x += b.dir * b.speed * dt;
        if (b.dir === 1 && b.x > w + 16) b.x = -16;
        if (b.dir === -1 && b.x < -16) b.x = w + 16;
      }

      // Atualiza relâmpagos (caindo no fundo ou direto no topo das torres do castelo)
      const lt = state.lightning;
      if (lt.activeTime > 0) {
        lt.activeTime -= dt;
        lt.flashAlpha = Math.max(0, (lt.activeTime / lt.duration) * 0.22);
      } else {
        lt.flashAlpha = 0;
        lt.timer -= dt;
        if (lt.timer <= 0) {
          lt.timer = utils.rand(2.4, 5.2);
          lt.duration = utils.rand(0.22, 0.36);
          lt.activeTime = lt.duration;

          // 65% de chance de atingir uma das torres do castelo, 35% de cair no céu ao fundo
          const hitsTower = state.towerTips.length > 0 && Math.random() < 0.65;
          const target = hitsTower
            ? state.towerTips[utils.randInt(0, state.towerTips.length - 1)]
            : { x: utils.randInt(20, w - 20), y: Math.floor(h * 0.65) };

          let curX = target.x + utils.randInt(-18, 18);
          let curY = 0;
          const segs = [];
          const steps = 10;
          for (let s = 1; s <= steps; s++) {
            const nextY = Math.round((target.y / steps) * s);
            const nextX =
              s === steps
                ? target.x
                : Math.round(curX + (target.x - curX) * (1 / (steps - s + 1)) + utils.rand(-7, 7));
            segs.push({ x0: curX, y0: curY, x1: nextX, y1: nextY });
            curX = nextX;
            curY = nextY;
          }
          lt.segments = segs;
        }
      }
    },

    render(ctx, state, time, w, h) {
      // 1. Céu noturno + Lua
      ctx.drawImage(state.bgCanvas, 0, 0);

      // 2. Relâmpago e clarão atmosférico no céu
      const lt = state.lightning;
      if (lt.activeTime > 0 && lt.segments.length > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(216, 180, 254, ${lt.flashAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);

        // Desenha o raio ramificado em pixel art
        for (let i = 0; i < lt.segments.length; i++) {
          const seg = lt.segments[i];
          const steps = Math.max(1, Math.abs(seg.y1 - seg.y0));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const px = Math.round(seg.x0 + (seg.x1 - seg.x0) * t);
            const py = Math.round(seg.y0 + (seg.y1 - seg.y0) * t);
            ctx.fillStyle = '#c084fc';
            ctx.fillRect(px - 1, py, 3, 1);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(px, py, 1, 1);
          }
        }
        ctx.restore();
      }

      // 3. Castelo do Drácula
      ctx.drawImage(state.castleCanvas, 0, 0);

      // 4. Morceguinhos com olhos vermelhos passando
      for (let i = 0; i < state.bats.length; i++) {
        const b = state.bats[i];
        const frameIdx = Math.floor(time * 9 + b.phase) & 1;
        const by = b.baseY + Math.sin(time * b.waveFreq + b.phase) * b.waveAmp;
        ctx.drawImage(state.batFrames[frameIdx], Math.round(b.x), Math.round(by));
      }

      // 5. Chuva caindo
      ctx.fillStyle = 'rgba(186, 200, 235, 0.38)';
      for (let i = 0; i < state.raindrops.length; i++) {
        const r = state.raindrops[i];
        const rx = Math.round(r.x);
        const ry = Math.round(r.y);
        for (let l = 0; l < r.len; l++) {
          ctx.fillRect(rx - Math.floor(l * 0.25), ry + l, 1, 1);
        }
      }
    }
  });

  // ==========================================================================
  // TEMA 5: SAKURA SUNSET (Jardim Japonês ao Entardecer — Pétalas e Lago)
  // ==========================================================================
  GeminiWallpaperEngine.registerTheme({
    id: 'sakura',
    label: 'Jardim Sakura (Sakura Sunset)',
    shortLabel: 'Sakura',
    icon: '🌸',
    brand: {
      primary: '#f472b6',
      secondary: '#fb923c',
      bg: '#2b1228'
    },
    glassVars: {
      '--gr-glass-bg': 'rgba(26, 12, 28, 0.74)',
      '--gr-glass-bg-strong': 'rgba(19, 8, 21, 0.86)',
      '--gr-glass-bg-subtle': 'rgba(32, 15, 34, 0.64)',
      '--gr-glass-bg-hover': 'rgba(54, 22, 52, 0.80)',
      '--gr-glass-border': 'rgba(244, 114, 182, 0.28)',
      '--gr-glass-border-strong': 'rgba(251, 207, 232, 0.46)',
      '--gr-accent-glow': 'rgba(244, 114, 182, 0.26)',
      '--gr-scrollbar-thumb': 'rgba(244, 114, 182, 0.34)',
      '--gr-scrollbar-thumb-hover': 'rgba(251, 207, 232, 0.60)'
    },

    init(w, h, utils) {
      const lakeY = Math.floor(h * 0.72);
      const { canvas: sceneCanvas, ctx: sCtx } = utils.createBuffer(w, h);

      // Céu crepuscular rosa-pêssego/violeta
      const skyGrad = utils.createDitheredGradient(
        w,
        lakeY,
        ['#2e1035', '#591c4d', '#9d3663', '#d95d67', '#f5906c', '#fcd392'],
        6
      );
      sCtx.drawImage(skyGrad, 0, 0);

      // Lago espelhado na base
      const lakeGrad = utils.createDitheredGradient(
        w,
        h - lakeY,
        ['#9d3663', '#6b214b', '#3f1336', '#210921'],
        5
      );
      sCtx.drawImage(lakeGrad, 0, lakeY);

      // Sol poente suave perto do horizonte
      const sunX = Math.floor(w * 0.5);
      const sunY = lakeY - 12;
      const sunR = Math.max(14, Math.floor(h * 0.11));
      for (let dy = -sunR; dy <= 12; dy++) {
        for (let dx = -sunR; dx <= sunR; dx++) {
          if (dx * dx + dy * dy <= sunR * sunR && sunY + dy < lakeY) {
            sCtx.fillStyle = dy < 0 ? '#fef08a' : '#fde047';
            sCtx.fillRect(sunX + dx, sunY + dy, 1, 1);
          }
        }
      }

      // Silhueta do Monte Fuji ao fundo
      for (let x = 0; x < w; x++) {
        const dist = Math.abs(x - sunX);
        const fujiH = Math.max(0, 38 - Math.pow(dist * 0.042, 1.55) * 28);
        if (fujiH > 1) {
          const topY = Math.round(lakeY - Math.min(34, fujiH));
          sCtx.fillStyle = '#3b1538';
          sCtx.fillRect(x, topY, 1, lakeY - topY);
          if (fujiH > 26 && topY < lakeY - 22) {
            sCtx.fillStyle = '#fbcfe8';
            sCtx.fillRect(x, topY, 1, Math.min(6, Math.round((fujiH - 25) * 0.8)));
          }
        }
      }

      // Torii tradicional na água à direita
      const toriiX = Math.floor(w * 0.74);
      const toriiBaseY = lakeY + 4;
      sCtx.fillStyle = '#240a22';
      sCtx.fillRect(toriiX - 8, toriiBaseY - 20, 2, 20);
      sCtx.fillRect(toriiX + 6, toriiBaseY - 20, 2, 20);
      sCtx.fillRect(toriiX - 13, toriiBaseY - 21, 26, 3);
      sCtx.fillRect(toriiX - 10, toriiBaseY - 15, 20, 2);

      // Galhos de Sakura no canto superior esquerdo e direito
      for (let x = 0; x < Math.floor(w * 0.34); x++) {
        const canopyH = Math.round((1 - x / (w * 0.34)) * 34 + Math.sin(x * 0.25) * 4);
        for (let y = 0; y < canopyH; y++) {
          sCtx.fillStyle = (x + y) % 3 === 0 ? '#f9a8d4' : (x + y) % 2 === 0 ? '#f472b6' : '#be185d';
          sCtx.fillRect(x, y, 1, 1);
        }
      }

      // Pétalas de Sakura caindo com o vento
      const petalSprites = [
        utils.spriteFromMatrix(['.p', 'pp'], { p: '#fbcfe8' }),
        utils.spriteFromMatrix(['p.', '.h'], { p: '#f472b6', h: '#fce7f3' })
      ];

      const petals = [];
      const petalCount = Math.max(24, Math.floor(w / 10));
      for (let i = 0; i < petalCount; i++) {
        petals.push({
          sprite: petalSprites[i % petalSprites.length],
          x: utils.rand(0, w),
          y: utils.rand(0, h),
          speedX: utils.rand(6, 14),
          speedY: utils.rand(7, 15),
          swayAmp: utils.rand(2, 5),
          swayFreq: utils.rand(1.5, 3.0),
          phase: utils.rand(0, Math.PI * 2)
        });
      }

      // Lanternas flutuantes no lago
      const lanternSprite = utils.spriteFromMatrix(
        [
          '.yyy.',
          'ywwwy',
          'ywwwy',
          'bbbbb'
        ],
        {
          y: '#f59e0b',
          w: '#fef08a',
          b: '#451a03'
        }
      );

      const lanterns = [];
      for (let i = 0; i < 4; i++) {
        lanterns.push({
          sprite: lanternSprite,
          x: (i + 0.5) * (w / 4),
          y: lakeY + 7 + (i % 2) * 8,
          speed: utils.rand(1.8, 3.2),
          phase: utils.rand(0, Math.PI * 2)
        });
      }

      return { sceneCanvas, lakeY, petals, lanterns };
    },

    update(state, dt, time, w, h, utils) {
      for (let i = 0; i < state.petals.length; i++) {
        const p = state.petals[i];
        p.x += p.speedX * dt;
        p.y += p.speedY * dt;
        if (p.y > h + 4) {
          p.y = -4;
          p.x = utils.rand(-20, w);
        }
        if (p.x > w + 6) {
          p.x = -6;
        }
      }

      for (let i = 0; i < state.lanterns.length; i++) {
        const l = state.lanterns[i];
        l.x += l.speed * dt;
        if (l.x > w + 10) l.x = -10;
      }
    },

    render(ctx, state, time, w, h) {
      ctx.drawImage(state.sceneCanvas, 0, 0);

      // Reflexo solar cintilando na água
      ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
      const midX = Math.floor(w * 0.5);
      for (let y = state.lakeY + 2; y < h - 4; y += 3) {
        const spread = Math.max(4, Math.floor(18 - (y - state.lakeY) * 0.3));
        const shift = Math.round(Math.sin(time * 2.5 + y * 0.5) * 3);
        ctx.fillRect(midX - Math.floor(spread / 2) + shift, y, spread, 1);
      }

      // Lanternas flutuando na água
      for (let i = 0; i < state.lanterns.length; i++) {
        const l = state.lanterns[i];
        const lx = Math.round(l.x);
        const ly = Math.round(l.y + Math.sin(time * 1.6 + l.phase) * 1);
        ctx.drawImage(l.sprite, lx, ly);
      }

      // Pétalas de Sakura voando
      for (let i = 0; i < state.petals.length; i++) {
        const p = state.petals[i];
        const px = Math.round(p.x + Math.sin(time * p.swayFreq + p.phase) * p.swayAmp);
        const py = Math.round(p.y);
        ctx.drawImage(p.sprite, px, py);
      }
    }
  });

  // ==========================================================================
  // TEMA 6: NORTHERN LIGHTS (Aurora Boreal Ártica, Montanhas e Neve)
  // ==========================================================================
  GeminiWallpaperEngine.registerTheme({
    id: 'aurora',
    label: 'Aurora Boreal (Northern Lights)',
    shortLabel: 'Aurora',
    icon: '🌌',
    brand: {
      primary: '#2dd4bf',
      secondary: '#a855f7',
      bg: '#061c24'
    },
    glassVars: {
      '--gr-glass-bg': 'rgba(7, 22, 30, 0.74)',
      '--gr-glass-bg-strong': 'rgba(5, 16, 22, 0.86)',
      '--gr-glass-bg-subtle': 'rgba(9, 28, 38, 0.64)',
      '--gr-glass-bg-hover': 'rgba(16, 48, 60, 0.80)',
      '--gr-glass-border': 'rgba(45, 212, 191, 0.26)',
      '--gr-glass-border-strong': 'rgba(94, 234, 212, 0.45)',
      '--gr-accent-glow': 'rgba(45, 212, 191, 0.26)',
      '--gr-scrollbar-thumb': 'rgba(45, 212, 191, 0.34)',
      '--gr-scrollbar-thumb-hover': 'rgba(94, 234, 212, 0.60)'
    },

    init(w, h, utils) {
      const groundY = Math.floor(h * 0.76);
      const bgCanvas = utils.createDitheredGradient(
        w,
        h,
        ['#030914', '#061426', '#0a2236', '#0d2e42', '#071b29'],
        6
      );

      // Montanhas nevadas e pinheiros árticos pré-renderizados
      const { canvas: fgCanvas, ctx: fCtx } = utils.createBuffer(w, h);

      for (let x = 0; x < w; x++) {
        const m1 = Math.abs(((x * 0.9) % 90) - 45);
        const m2 = Math.abs(((x * 0.55 + 30) % 110) - 55);
        const peakY = Math.round(groundY - 36 + Math.min(m1 * 0.7, m2 * 0.55));
        fCtx.fillStyle = '#0c2536';
        fCtx.fillRect(x, peakY, 1, groundY - peakY);
        // Topo nevado iluminado pela aurora
        if (x % 90 > 32 && x % 90 < 58) {
          fCtx.fillStyle = '#ccfbf1';
          fCtx.fillRect(x, peakY, 1, Math.min(8, Math.max(1, groundY - peakY)));
        }
      }

      // Chão de neve e lago congelado
      fCtx.fillStyle = '#082030';
      fCtx.fillRect(0, groundY, w, h - groundY);
      fCtx.fillStyle = '#5eead4';
      fCtx.fillRect(0, groundY, w, 1);

      // Pinheiros cobertos de neve
      for (let tx = 10; tx < w - 10; tx += 18) {
        const treeH = 12 + (tx % 7);
        const base = groundY + 4;
        for (let ty = 0; ty < treeH; ty++) {
          const halfW = Math.floor((ty / treeH) * 4);
          fCtx.fillStyle = ty % 3 === 0 ? '#99f6e4' : '#06373a';
          fCtx.fillRect(tx - halfW, base - treeH + ty, halfW * 2 + 1, 1);
        }
      }

      const stars = [];
      for (let i = 0; i < 45; i++) {
        stars.push({
          x: utils.randInt(0, w),
          y: utils.randInt(0, groundY - 20),
          phase: utils.rand(0, Math.PI * 2)
        });
      }

      const snowflakes = [];
      const snowCount = Math.max(30, Math.floor(w / 9));
      for (let i = 0; i < snowCount; i++) {
        snowflakes.push({
          x: utils.rand(0, w),
          y: utils.rand(0, h),
          speedY: utils.rand(6, 14),
          swayAmp: utils.rand(1.5, 4),
          phase: utils.rand(0, Math.PI * 2)
        });
      }

      return { bgCanvas, fgCanvas, groundY, stars, snowflakes };
    },

    update(state, dt, time, w, h, utils) {
      for (let i = 0; i < state.snowflakes.length; i++) {
        const s = state.snowflakes[i];
        s.y += s.speedY * dt;
        if (s.y > h + 2) {
          s.y = -2;
          s.x = utils.rand(0, w);
        }
      }
    },

    render(ctx, state, time, w) {
      ctx.drawImage(state.bgCanvas, 0, 0);

      // Estrelas no céu ártico
      ctx.fillStyle = '#e2e8f0';
      for (let i = 0; i < state.stars.length; i++) {
        const st = state.stars[i];
        if (Math.sin(time * 2 + st.phase) > -0.4) {
          ctx.fillRect(st.x, st.y, 1, 1);
        }
      }

      // Cortinas dançantes da Aurora Boreal em Pixel Art Moderna
      for (let x = 0; x < w; x += 2) {
        const wave1 = Math.sin(x * 0.025 + time * 0.9) * 10 + Math.cos(x * 0.05 - time * 0.6) * 6;
        const baseY = Math.round(26 + wave1);
        const curtainH = Math.round(22 + Math.sin(x * 0.04 + time * 1.1) * 8);

        ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';
        ctx.fillRect(x, baseY - 6, 2, 7);

        ctx.fillStyle = 'rgba(45, 212, 191, 0.32)';
        ctx.fillRect(x, baseY, 2, Math.floor(curtainH * 0.6));

        ctx.fillStyle = 'rgba(110, 231, 183, 0.48)';
        ctx.fillRect(x, baseY + Math.floor(curtainH * 0.6), 2, Math.floor(curtainH * 0.4));
      }

      // Montanhas e pinheiros
      ctx.drawImage(state.fgCanvas, 0, 0);

      // Flocos de neve caindo suavemente
      ctx.fillStyle = 'rgba(240, 253, 250, 0.85)';
      for (let i = 0; i < state.snowflakes.length; i++) {
        const s = state.snowflakes[i];
        const sx = Math.round(s.x + Math.sin(time * 1.5 + s.phase) * s.swayAmp);
        ctx.fillRect(sx, Math.round(s.y), 1, 1);
      }
    }
  });
})();
