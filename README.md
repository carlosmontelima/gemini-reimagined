# ✨ Gemini Reimagined — Pixel Art & Glass UI

<div align="center">

**[🇧🇷 Português (Brasil)](#-português-brasil) • [🇺🇸 English](#-english)**

</div>

---

## 🎬 Preview / Demonstração em Vídeo

---

# 🇧🇷 Português (Brasil)

Uma extensão de navegador (**Manifest V3**) leve e sem dependências externas que transforma a interface do [Google Gemini](https://gemini.google.com/) em um ambiente **Glassmorphism** customizável com **wallpapers animados em Pixel Art Moderna** (Hi-Bit), relógio dinâmico na tela inicial e transições de ambiente em tempo real.

### 🌟 Funcionalidades Principais

- 🎨 **6 Ambientes Animados em Pixel Art Moderna:**
  - 🌊 **Ocean (Fundo do Mar):** Gradiente oceânico em *dithering* Bayer 4x4, feixes de luz subaquática, bolhas subindo em senoide, 4 espécies de peixes nadando em múltiplas profundidades, algas, corais e estrelas do mar animadas.
  - 🪐 **Space (Espaço Cósmico):** Nebulosa em *dithering*, 3 camadas de estrelas em *parallax* (com cintilação em cruz pixelada) e planetas com anéis desenhados em matriz de pixels.
  - ☁️ **Sky (Céu):** Céu azul-bebê com 4 formatos de nuvens volumétricas em velocidades distintas e ciclo suave de *fade-in / fade-out*.
  - 🧛 **Dracula Castle (Castelo do Drácula):** Castelo gótico negro com vitrais iluminados sob tempestade noturna, chuva contínua, **raios ramificados** caindo no fundo e no topo das torres e **morceguinhos de olhos vermelhos**.
  - 🌸 **Sakura Sunset (Jardim Japonês):** Entardecer com Monte Fuji, *Torii*, lanternas flutuantes no lago e pétalas de cerejeira caindo ao vento.
  - 🌌 **Northern Lights (Aurora Boreal):** Cortinas dançantes de aurora boreal sobre montanhas nevadas, pinheiros árticos e neve caindo.
- 🔄 **Transição de Transformação de Ambiente:** Ao trocar de tema, o motor executa uma fusão suave combinada com uma onda de transformação em pixel art que mescla o cenário antigo ao novo.
- 🕒 **Relógio Dinâmico na Página Inicial (3 Estados):** Botão no canto inferior direito que alterna entre **Desativado (`OFF`)**, **Hora + Minuto (`HH:MM`)** e **Hora + Minuto + Segundo (`HH:MM:SS`)**, exibido exclusivamente na tela inicial centralizado acima da mensagem de boas-vindas.
- 🖼️ **Menu da Setinha (Studio em Shadow DOM):** Painel flutuante isolado com *mini-previews* animados ao vivo de cada tema em quadradinhos individuais.
- ⌨️ **Barra de Input com Live Preview Borrada:** A própria caixa de digitação roda uma versão panorâmica animada, escura e com *blur* do tema ativo no fundo.
- 🔤 **Tipografia em Tempo Real:** Alternância instantânea de fonte (`Inter`, `Fira Code`, `Press Start 2P`, `Serif`) e tamanho do texto (`14px` a `22px`) com persistência em `chrome.storage.local` e `localStorage`.
- 💎 **Glassmorphism & Scrollbar Linear:** Cards de conversa que abraçam o texto com fundo escuro translúcido e *blur*, barra lateral transparente, seletor de modelos estilizado e *scrollbar* contínua sem trilhas opacas.

### 🚀 Como Instalar (Modo Desenvolvedor)

1. Clone ou baixe este repositório em sua máquina:
   ```bash
   git clone https://github.com/carlosmontelima/gemini-reimagined.git
   ```
2. Abra o navegador baseado em Chromium e acesse:
   - **Chrome:** `chrome://extensions/`
   - **Edge:** `edge://extensions/`
   - **Brave:** `brave://extensions/`
3. Ative a chave **Modo do desenvolvedor** (*Developer mode*) no canto superior direito.
4. Clique em **Carregar sem compactação** (*Load unpacked*) e selecione a pasta raiz do projeto (`gemini-reimagined`).
5. Acesse [https://gemini.google.com/](https://gemini.google.com/) (ou recarregue a página com `F5`).

### 🛠️ Como Adicionar Novos Temas

O motor foi projetado com descoberta automática. Para criar um novo tema, basta registrar um novo objeto ao final de [`src/scripts/background-canvas.js`](./src/scripts/background-canvas.js) usando `window.GeminiWallpaperEngine.registerTheme`:

```javascript
window.GeminiWallpaperEngine.registerTheme({
  id: 'meu-tema',
  label: 'Meu Novo Tema',
  shortLabel: 'Novo Tema',
  icon: '🌅',
  brand: {
    primary: '#fb923c',
    secondary: '#f43f5e',
    bg: '#1c1026'
  },
  glassVars: {
    '--gr-glass-bg': 'rgba(28, 16, 38, 0.74)',
    '--gr-glass-bg-strong': 'rgba(18, 10, 26, 0.86)',
    '--gr-glass-border': 'rgba(251, 146, 60, 0.28)',
    '--gr-accent-glow': 'rgba(249, 115, 22, 0.28)'
  },
  init(w, h, utils) {
    const bgCanvas = utils.createDitheredGradient(w, h, ['#1c1026', '#6b214b', '#fb923c']);
    return { bgCanvas };
  },
  update(state, dt, time, w, h, utils) {
    // Atualização de partículas e entidades a cada frame
  },
  render(ctx, state, time, w, h, utils) {
    ctx.drawImage(state.bgCanvas, 0, 0);
  }
});
```

---

# 🇺🇸 English

A lightweight, zero-dependency **Manifest V3** browser extension that transforms [Google Gemini](https://gemini.google.com/) into a customizable **Glassmorphism** workspace featuring **Modern Pixel Art (Hi-Bit) animated wallpapers**, a dynamic home screen clock, and real-time environment transitions.

### 🌟 Key Features

- 🎨 **6 Modern Pixel Art Animated Environments:**
  - 🌊 **Ocean:** Deep ocean gradient with 4x4 Bayer dithering, underwater sunbeams, sine-wave rising bubbles, 4 pixel-art fish species swimming at multiple depths, swaying kelp, corals, and animated starfish.
  - 🪐 **Space:** Dithered cosmic nebula, 3-layer parallax starfield (with pixel-cross twinkling stars), and ringed planets drawn via pixel matrices.
  - ☁️ **Sky:** Baby-blue daytime sky with 4 volumetric cloud shapes drifting at different parallax speeds with smooth *fade-in / fade-out* cycles.
  - 🧛 **Dracula Castle:** Dark Gothic castle with glowing stained-glass windows under a stormy night sky, continuous rain, **branching lightning bolts** striking the background and castle spires, and **red-eyed bats**.
  - 🌸 **Sakura Sunset:** Japanese twilight with Mount Fuji, a lakeside *Torii* gate, floating lanterns on the water, and cherry blossom petals drifting in the wind.
  - 🌌 **Northern Lights (Aurora):** Dancing emerald and violet aurora curtains above snow-capped mountains, arctic pines, and gently falling snow.
- 🔄 **Seamless Environment Morph Transitions:** Switching themes triggers a smooth cross-dissolve combined with a pixel-art transformation wave that blends the previous world into the new one.
- 🕒 **Dynamic Home Clock (3 Modes):** Bottom-right toggle button that cycles between **Disabled (`OFF`)**, **Hours + Minutes (`HH:MM`)**, and **Hours + Minutes + Seconds (`HH:MM:SS`)**, displayed exclusively on the home screen centered above the welcome greeting.
- 🖼️ **Studio Floating Menu (Shadow DOM):** Isolated floating customization panel with live animated pixel-art mini-previews for every registered theme.
- ⌨️ **Live Blurred Theme Preview Inside the Input Bar:** The prompt input box itself runs a darkened, softly blurred panoramic animation of the active theme behind your text.
- 🔤 **Real-Time Typography Control:** Instant switching between font families (`Inter`, `Fira Code`, `Press Start 2P`, `Serif`) and font sizes (`14px` to `22px`), persisted via `chrome.storage.local` and `localStorage`.
- 💎 **Glassmorphism & Continuous Linear Scrollbar:** Message cards that hug the text with dark translucent blur for crisp legibility, frosted glass sidebar, styled model selector, and a clean linear scrollbar without opaque tracks.

### 🚀 Installation (Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/carlosmontelima/gemini-reimagined.git
   ```
2. Open your Chromium-based browser and navigate to:
   - **Chrome:** `chrome://extensions/`
   - **Edge:** `edge://extensions/`
   - **Brave:** `brave://extensions/`
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the root project folder (`gemini-reimagined`).
5. Open [https://gemini.google.com/](https://gemini.google.com/) (or refresh the tab with `F5`).

### 🛠️ How to Add New Themes

The wallpaper engine uses automatic theme discovery. To add a new theme, register a theme object at the bottom of [`src/scripts/background-canvas.js`](./src/scripts/background-canvas.js) via `window.GeminiWallpaperEngine.registerTheme`:

```javascript
window.GeminiWallpaperEngine.registerTheme({
  id: 'my-theme',
  label: 'My New Theme',
  shortLabel: 'New Theme',
  icon: '🌅',
  brand: {
    primary: '#fb923c',
    secondary: '#f43f5e',
    bg: '#1c1026'
  },
  glassVars: {
    '--gr-glass-bg': 'rgba(28, 16, 38, 0.74)',
    '--gr-glass-bg-strong': 'rgba(18, 10, 26, 0.86)',
    '--gr-glass-border': 'rgba(251, 146, 60, 0.28)',
    '--gr-accent-glow': 'rgba(249, 115, 22, 0.28)'
  },
  init(w, h, utils) {
    const bgCanvas = utils.createDitheredGradient(w, h, ['#1c1026', '#6b214b', '#fb923c']);
    return { bgCanvas };
  },
  update(state, dt, time, w, h, utils) {
    // Update particles and entities each frame
  },
  render(ctx, state, time, w, h, utils) {
    ctx.drawImage(state.bgCanvas, 0, 0);
  }
});
```

Once registered, the new theme automatically gets:
1. A square card with a **live animated Pixel Art mini-preview** in the Studio menu;
2. The **environment morph transition** when switching to/from it;
3. The **blurred live preview** inside the prompt input bar;
4. A **pixel-art favicon** and brand color palette on the browser tab.

---

## 📁 Project Structure / Estrutura de Pastas

```text
gemini-reimagined/
├── manifest.json                 # Manifest V3 configuration
├── README.md                     # Bilingual documentation (PT-BR & EN)
├── .gitignore                    # Git ignored files
├── assets/
│   ├── icons/                    # Pixel Art extension icons (16px, 48px, 128px)
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── preview/                  # Folder for demo video/GIF (demo.mp4 / demo.gif)
└── src/
    ├── scripts/
    │   ├── background-canvas.js  # Pixel Art engine, transitions, helpers & 6 themes
    │   └── content.js            # Shadow DOM UI, dynamic clock, input preview & favicon
    └── styles/
        └── styles.css            # Native DOM transparency, Glassmorphism & linear scrollbar
```
