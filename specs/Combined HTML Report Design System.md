# Dual-Theme HTML Report Design System
**Dark + Light with Persistent Toggle**

This is the single authoritative design document. It combines the "Neon Terminal Dark" and "Daylight Editorial Light" systems into one CSS-variable-driven framework with a floating theme toggle button. One HTML file, one toggle, both themes — preference saved to localStorage.

---

## HOW THE THEME SYSTEM WORKS

All colors are CSS custom properties declared on `:root` (light theme default). When `data-theme="dark"` is set on the `<html>` element, a second block overrides those same variables with the dark values. A 200ms color transition on `*` makes the swap feel smooth and intentional.

The toggle button reads and writes `localStorage.getItem('theme')`. On page load, the script checks localStorage first, then falls back to `prefers-color-scheme` (respects the user's OS setting automatically).

**Core principle:** Every color in the stylesheet must use a CSS variable — never a hardcoded hex value. This is what makes the theme swap work without duplicate CSS.

---

## CSS VARIABLE DECLARATIONS

Place this in your `<style>` block. Both themes defined in one place.

```css
/* ── LIGHT THEME (default) ───────────────────────────────────── */
:root {
  --bg:          #f8fafc;
  --surface:     #ffffff;
  --surface-2:   #f1f5f9;

  --accent:      #0077cc;   /* blue     — info, links, primary    */
  --green:       #059669;   /* forest   — done, success, active   */
  --amber:       #d97706;   /* amber    — pending, warning        */
  --red:         #dc2626;   /* red      — error, critical, urgent */
  --purple:      #7c3aed;   /* indigo   — queued, secondary       */
  --rose:        #db2777;   /* rose     — tertiary, mixed         */

  --accent-rgb:  0,119,204;
  --green-rgb:   5,150,105;
  --amber-rgb:   217,119,6;
  --red-rgb:     220,38,38;
  --purple-rgb:  124,58,237;
  --rose-rgb:    219,39,119;

  --text:        #1e293b;   /* body copy              */
  --muted:       #64748b;   /* labels, metadata only  */
  --ink:         #0f172a;   /* headings, card titles  */

  --border:      rgba(0,0,0,0.06);
  --border-hover:rgba(0,0,0,0.10);
  --rule:        rgba(0,0,0,0.08);

  --shadow-card: 0 8px 32px rgba(0,0,0,0.08);
  --spotlight:   .04;       /* radial gradient opacity on cards */

  /* Gradient definitions — light (deep ink tones) */
  --grad-main:   linear-gradient(120deg, #7c3aed 0%, #0077cc 45%, #059669 100%);
  --grad-cyan:   linear-gradient(120deg, #0077cc 0%, #7c3aed 100%);
  --grad-green:  linear-gradient(120deg, #059669 0%, #0077cc 80%);
  --grad-amber:  linear-gradient(120deg, #d97706 0%, #db2777 100%);
  --grad-red:    linear-gradient(120deg, #dc2626 0%, #d97706 100%);
  --grad-purple: linear-gradient(120deg, #7c3aed 0%, #db2777 100%);
  --grad-pink:   linear-gradient(120deg, #db2777 0%, #7c3aed 60%, #0077cc 100%);

  /* Toggle button appearance */
  --toggle-bg:   #ffffff;
  --toggle-border: rgba(0,0,0,0.10);
  --toggle-icon: '🌙';
  --toggle-label:'Dark mode';
}

/* ── DARK THEME ──────────────────────────────────────────────── */
[data-theme="dark"] {
  --bg:          #08080c;
  --surface:     #0c0c14;
  --surface-2:   #111119;

  --accent:      #5eb8ff;   /* neon cyan   */
  --green:       #34d987;   /* neon green  */
  --amber:       #f5c444;   /* bright amber*/
  --red:         #ff5e7a;   /* neon red    */
  --purple:      #a78bfa;   /* lavender    */
  --rose:        #f472b6;   /* neon pink   */

  --accent-rgb:  94,184,255;
  --green-rgb:   52,217,135;
  --amber-rgb:   245,196,68;
  --red-rgb:     255,94,122;
  --purple-rgb:  167,139,250;
  --rose-rgb:    244,114,182;

  --text:        #e2e8f0;
  --muted:       #94a3b8;
  --ink:         #f8fafc;

  --border:      rgba(255,255,255,0.07);
  --border-hover:rgba(255,255,255,0.13);
  --rule:        rgba(255,255,255,0.07);

  --shadow-card: 0 12px 40px rgba(0,0,0,0.4);
  --spotlight:   .055;

  /* Gradient definitions — dark (neon tones) */
  --grad-main:   linear-gradient(120deg, #a78bfa 0%, #5eb8ff 45%, #34d987 100%);
  --grad-cyan:   linear-gradient(120deg, #5eb8ff 0%, #a78bfa 100%);
  --grad-green:  linear-gradient(120deg, #34d987 0%, #5eb8ff 80%);
  --grad-amber:  linear-gradient(120deg, #f5c444 0%, #f472b6 100%);
  --grad-red:    linear-gradient(120deg, #ff5e7a 0%, #f5c444 100%);
  --grad-purple: linear-gradient(120deg, #a78bfa 0%, #f472b6 100%);
  --grad-pink:   linear-gradient(120deg, #f472b6 0%, #a78bfa 60%, #5eb8ff 100%);

  --toggle-bg:   #0c0c14;
  --toggle-border: rgba(255,255,255,0.10);
  --toggle-icon: '☀️';
  --toggle-label:'Light mode';
}
```

### Global color transition

```css
*, *::before, *::after {
  transition: background-color 200ms ease, border-color 200ms ease,
              color 200ms ease, box-shadow 200ms ease;
}
```

---

## FLOATING THEME TOGGLE BUTTON

Fixed in the top-right corner, always visible. Styled as a chip matching the design system. Shows the moon icon (🌙) in light mode (click to go dark) and sun icon (☀️) in dark mode (click to go light).

### HTML — place anywhere in `<body>`

```html
<button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">
  <span class="theme-toggle-icon" id="themeIcon">🌙</span>
  <span class="theme-toggle-label" id="themeLabel">Dark mode</span>
</button>
```

### CSS

```css
.theme-toggle {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 10000;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--toggle-bg);
  border: 1px solid var(--toggle-border);
  cursor: pointer;
  font-family: 'Inter Tight', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .06em;
  color: var(--muted);
  box-shadow: 0 2px 12px rgba(0,0,0,0.10);
  /* Exclude from the global * transition so it responds instantly */
  transition: background-color 200ms ease, border-color 200ms ease,
              color 200ms ease, box-shadow 200ms ease, transform 100ms ease;
}
.theme-toggle:hover {
  color: var(--ink);
  border-color: var(--border-hover);
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  transform: translateY(-1px);
}
.theme-toggle:active { transform: translateY(0); }
.theme-toggle-icon { font-size: 14px; line-height: 1; }
```

### JavaScript — theme toggle logic

Place this block **before** `</body>`. It handles initialization, toggling, and localStorage persistence.

```javascript
// ── THEME TOGGLE ──────────────────────────────────────────────
(function() {
  const html    = document.documentElement;
  const btn     = document.getElementById('themeToggle');
  const icon    = document.getElementById('themeIcon');
  const label   = document.getElementById('themeLabel');

  // On load: check localStorage, then system preference
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(initial);

  btn.addEventListener('click', () => {
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
  });

  function applyTheme(theme) {
    html.dataset.theme = theme;
    if (theme === 'dark') {
      icon.textContent  = '☀️';
      label.textContent = 'Light mode';
    } else {
      icon.textContent  = '🌙';
      label.textContent = 'Dark mode';
    }
  }
})();
```

---

## TYPOGRAPHY

**Font:** Inter Tight — load from Google Fonts.
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
```

```css
body {
  font-family: 'Inter Tight', sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 16px;
  line-height: 1.65;
}
```

**Size hierarchy:**

| Element | Size | Weight | Color token |
|---|---|---|---|
| Document H1 | `clamp(36px, 6vw, 56px)` | 900 | Gradient text only |
| Section label | `17px` | 800 | Gradient text only |
| Card title | `13px` | 700 | `var(--ink)` |
| Card value (stat) | `26px` | 900 | Gradient text only |
| Body / card para | `15–16px` | 400 | `var(--text)` |
| KV rows | `14px` | 500 | Keys `var(--muted)`, values `var(--ink)` |
| Checklist items | `14px` | 400 | `var(--text)` |
| Badge / chip | `10–11px` | 600–700 | Per-variant accent |
| Muted labels | `10–12px` | 500–700 | `var(--muted)` only |

---

## GRADIENT TEXT SYSTEM

Gradient text **only** on: H1, section labels, large stat numbers. Never on body copy, KV values, or checklist items.

The gradients are defined as CSS variables and swap automatically with the theme — deep ink tones in light mode, neon in dark mode.

```css
.grad {
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  display: inline;
}
.grad-main   { background-image: var(--grad-main); }
.grad-cyan   { background-image: var(--grad-cyan); }
.grad-green  { background-image: var(--grad-green); }
.grad-amber  { background-image: var(--grad-amber); }
.grad-red    { background-image: var(--grad-red); }
.grad-purple { background-image: var(--grad-purple); }
.grad-pink   { background-image: var(--grad-pink); }
```

**HTML usage:**
```html
<h1><span class="grad grad-main">Report Title</span></h1>

<div class="section-label">
  <span class="sl-num">01</span>
  <span class="grad grad-cyan">Section Name</span>
</div>
```

**Gradient assignment by section tone:**
| Section type | Gradient class |
|---|---|
| Onboarding / Status | `grad-cyan` |
| Credentials / Account | `grad-green` |
| Forms / Documents | `grad-amber` |
| Q&A / Reference | `grad-cyan` |
| Entities / Roster | `grad-purple` |
| Decision / History | `grad-green` |
| Actions / Urgent | `grad-red` |
| Notes / Misc | `grad-pink` |

---

## CARDS — CURSOR-TRACKED AMBIENT SPOTLIGHT

```css
.card {
  --mx: 30%; --my: 25%; --lr: var(--accent-rgb);
  background: var(--surface);
  background-image: radial-gradient(
    ellipse 80% 60% at var(--mx) var(--my),
    rgba(var(--lr), var(--spotlight)) 0%, transparent 65%
  );
  border: 1px solid var(--border);
  border-radius: 15px;
  padding: 26px;
  opacity: 0; transform: translateY(22px);
  transition: opacity 500ms ease, transform 500ms ease,
              border-color 250ms ease, box-shadow 250ms ease,
              background-image 0ms;
}
.card.visible { opacity: 1; transform: translateY(0); }
.card.visible:hover {
  transform: translateY(-3px);
  border-color: var(--border-hover);
  box-shadow: var(--shadow-card);
}

/* Accent variants — override --lr per card */
.card-cyan   { --lr: var(--accent-rgb); }
.card-green  { --lr: var(--green-rgb); }
.card-amber  { --lr: var(--amber-rgb); }
.card-red    { --lr: var(--red-rgb); }
.card-purple { --lr: var(--purple-rgb); }
.card-pink   { --lr: var(--rose-rgb); }

.card-icon {
  font-size: 22px; margin-bottom: 14px; display: block;
  filter: drop-shadow(0 0 6px rgba(var(--lr), .45));
}
.card-title {
  font-size: 13px; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; color: var(--ink); margin-bottom: 10px;
}
```

---

## SECTION LABELS

```css
.section-label {
  display: flex; align-items: center; gap: 12px;
  font-size: 17px; font-weight: 800; letter-spacing: .08em;
  text-transform: uppercase; margin-bottom: 22px;
}
.section-label::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, var(--rule), transparent);
}
.section-label .sl-num {
  font-size: 10px; color: var(--muted);
  font-weight: 400; flex-shrink: 0; opacity: .5;
}
```

```html
<div class="section-label">
  <span class="sl-num">01</span>
  <span class="grad grad-cyan">Section Title</span>
</div>
```

---

## LAYOUT

```css
.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 56px 24px 100px;
}
.grid-2   { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.grid-3   { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.grid-auto{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }

@media (max-width: 680px) {
  .grid-2, .grid-3, .grid-auto { grid-template-columns: 1fr; }
}

.section-block { margin-bottom: 64px; }
```

---

## TEXTURE

Dark mode gets a faint scanline overlay. Light mode gets nothing — clean is the texture.

```css
body::after {
  content: '';
  position: fixed; inset: 0; pointer-events: none; z-index: 9999;
  background: repeating-linear-gradient(
    0deg, transparent 0px, transparent 3px,
    rgba(0,0,0,0.025) 3px, rgba(0,0,0,0.025) 4px
  );
  opacity: 0;
  transition: opacity 200ms ease;
}
[data-theme="dark"] body::after { opacity: 1; }
```

---

## BORDERS & RADIUS

| Context | Value |
|---|---|
| Card default border | `var(--border)` |
| Card hover border | `var(--border-hover)` |
| Cards | `border-radius: 15px` |
| Small elements | `border-radius: 8px` |
| Pills / badges / chips | `border-radius: 999px` |

---

## COMPONENT LIBRARY

### Status Badges

```css
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 999px;
  font-size: 10px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; border: 1px solid;
}
.badge::before {
  content: ''; width: 5px; height: 5px;
  border-radius: 50%; background: currentColor;
}
.badge-done    { color: var(--green);  border-color: rgba(var(--green-rgb),.3);  background: rgba(var(--green-rgb),.08); }
.badge-active  { color: var(--accent); border-color: rgba(var(--accent-rgb),.3); background: rgba(var(--accent-rgb),.08); }
.badge-pending { color: var(--amber);  border-color: rgba(var(--amber-rgb),.3);  background: rgba(var(--amber-rgb),.08); }
.badge-hold    { color: var(--muted);  border-color: rgba(var(--muted),.25);     background: rgba(var(--muted),.05); }
.badge-warn    { color: var(--red);    border-color: rgba(var(--red-rgb),.3);    background: rgba(var(--red-rgb),.08); }
```

### Chips

```css
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 13px; border-radius: 999px;
  font-size: 11px; font-weight: 600; letter-spacing: .06em; border: 1px solid;
}
.chip-cyan   { color: var(--accent); border-color: rgba(var(--accent-rgb),.3);  background: rgba(var(--accent-rgb),.06); }
.chip-green  { color: var(--green);  border-color: rgba(var(--green-rgb),.3);   background: rgba(var(--green-rgb),.06); }
.chip-amber  { color: var(--amber);  border-color: rgba(var(--amber-rgb),.3);   background: rgba(var(--amber-rgb),.06); }
.chip-purple { color: var(--purple); border-color: rgba(var(--purple-rgb),.3);  background: rgba(var(--purple-rgb),.06); }
```

### Progress Bar

```css
.progress-bar {
  height: 4px; background: var(--surface-2);
  border-radius: 999px; overflow: hidden; margin-top: 16px;
}
.progress-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--green));
  transition: width 1s cubic-bezier(.25,.46,.45,.94) 300ms;
  width: 0;
}
.card.visible .progress-fill { width: var(--progress); }
```
```html
<div class="progress-bar"><div class="progress-fill" style="--progress:60%"></div></div>
```

### KV Table (key-value pairs)

```css
.kv { display: grid; grid-template-columns: auto 1fr; }
.kv-row { display: contents; }
.kv-row > * { padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.kv-row:last-child > * { border-bottom: none; }
.kv-key  { color: var(--muted); font-weight: 500; padding-right: 20px; white-space: nowrap; }
.kv-val  { color: var(--ink);   font-weight: 500; }
.kv-val.mono { font-family: 'SF Mono','Fira Code',monospace; font-size: 13px; color: var(--accent); }
```

### Interactive Checklist (with localStorage persistence)

Each checkbox saves its state to localStorage using a `data-id` attribute as the key. State persists across sessions — closing and reopening the file keeps all checked items checked.

```css
.checklist { list-style: none; display: flex; flex-direction: column; gap: 9px; margin: 0; padding: 0; }
.checklist li {
  display: flex; align-items: flex-start; gap: 10px;
  font-size: 14px; color: var(--text); line-height: 1.55;
  cursor: pointer; user-select: none;
}
.checklist li:hover { color: var(--ink); }

/* Custom checkbox */
.check-box {
  flex-shrink: 0; margin-top: 1px;
  width: 16px; height: 16px; border-radius: 4px;
  border: 1.5px solid var(--border-hover);
  background: var(--surface-2);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; transition: all 150ms ease;
}
.checklist li[data-checked="true"] .check-box {
  background: var(--green); border-color: var(--green); color: var(--bg);
}
.checklist li[data-checked="true"] .check-box::before { content: '✓'; font-weight: 700; }
.checklist li[data-checked="true"] > span { color: var(--muted); text-decoration: line-through; }

/* Priority variants */
.check-critical > span::before { content: '⚠ '; color: var(--red); font-size: 12px; }
.check-pending  > span::before { content: '◎ '; color: var(--amber); font-size: 12px; }
```

**HTML — each item needs a unique `data-id`:**
```html
<ul class="checklist">
  <li data-id="item-001" data-checked="false" onclick="toggleCheck(this)">
    <span class="check-box"></span>
    <span>Checklist item text</span>
  </li>
  <li data-id="item-002" data-checked="false" onclick="toggleCheck(this)" class="check-critical">
    <span class="check-box"></span>
    <span>Critical item text</span>
  </li>
</ul>
```

**JavaScript for checklist persistence:**
```javascript
// ── CHECKLIST — localStorage persistence ─────────────────────
function toggleCheck(li) {
  const id      = li.dataset.id;
  const current = li.dataset.checked === 'true';
  const next    = !current;
  li.dataset.checked = next;
  localStorage.setItem('check_' + id, next);
}

// On load: restore all saved checkbox states
document.querySelectorAll('.checklist li[data-id]').forEach(li => {
  const saved = localStorage.getItem('check_' + li.dataset.id);
  if (saved === 'true') li.dataset.checked = 'true';
});
```

### Callout Boxes

```css
.callout {
  border-radius: 8px; padding: 14px 16px;
  display: flex; gap: 12px; align-items: flex-start; margin-top: 12px;
}
.callout-info  { background: rgba(var(--accent-rgb),.06); border-left: 3px solid var(--accent); }
.callout-ok    { background: rgba(var(--green-rgb),.06);  border-left: 3px solid var(--green); }
.callout-warn  { background: rgba(var(--amber-rgb),.07);  border-left: 3px solid var(--amber); }
.callout-err   { background: rgba(var(--red-rgb),.06);    border-left: 3px solid var(--red); }
.callout-icon  { font-size: 16px; flex-shrink: 0; line-height: 1; }
.callout-body  { font-size: 14px; color: var(--text); line-height: 1.65; }
.callout-body strong { color: var(--ink); }
```
```html
<div class="callout callout-warn">
  <span class="callout-icon">⚠️</span>
  <div class="callout-body"><strong>Label:</strong> Body text here.</div>
</div>
```

### Timeline

```css
.timeline { position: relative; padding-left: 24px; }
.timeline::before {
  content: ''; position: absolute; left: 6px; top: 0; bottom: 0;
  width: 1px; background: linear-gradient(180deg, var(--accent), transparent);
}
.tl-item { position: relative; margin-bottom: 26px; }
.tl-item:last-child { margin-bottom: 0; }
.tl-dot {
  position: absolute; left: -21px; top: 4px;
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid var(--accent); background: var(--bg);
}
.tl-dot.done { background: var(--green); border-color: var(--green); }
.tl-dot.pend { background: transparent; border-color: var(--amber); }
.tl-date  { font-size: 10px; color: var(--muted); letter-spacing: .06em; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; }
.tl-title { font-size: 15px; color: var(--ink); font-weight: 700; margin-bottom: 5px; }
.tl-body  { font-size: 14px; color: var(--text); line-height: 1.6; }
```

### Monospace Address Block

```css
.address-block {
  background: rgba(var(--green-rgb),.05);
  border: 1px solid rgba(var(--green-rgb),.18);
  border-radius: 8px; padding: 16px 18px;
  font-family: 'SF Mono','Fira Code',monospace;
  font-size: 14px; line-height: 1.8; color: var(--green);
  letter-spacing: .02em; margin-top: 12px;
}
```

### Inline Code Highlight

```css
.hl {
  background: rgba(var(--accent-rgb),.10);
  border: 1px solid rgba(var(--accent-rgb),.20);
  border-radius: 4px; padding: 1px 6px;
  font-size: 13px; font-weight: 600; color: var(--accent);
  font-family: 'SF Mono',monospace;
}
```

### Stage Pills

```css
.stage-pill {
  display: inline-flex; padding: 2px 8px; border-radius: 999px;
  font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
}
.stage-1 { background: rgba(var(--green-rgb),.09);  color: var(--green);  border: 1px solid rgba(var(--green-rgb),.22); }
.stage-2 { background: rgba(var(--amber-rgb),.09);  color: var(--amber);  border: 1px solid rgba(var(--amber-rgb),.22); }
.stage-3 { background: rgba(var(--purple-rgb),.09); color: var(--purple); border: 1px solid rgba(var(--purple-rgb),.22); }
```

### Image Cards (for places — restaurants, hotels, etc.)

For the travel guide section where thumbnails appear alongside descriptions.

```css
.place-card {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
  transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
}
.place-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
  border-color: var(--border-hover);
}
.place-card img {
  width: 100%; height: 160px; object-fit: cover; display: block;
}
.place-card-body { padding: 14px 16px; }
.place-card-name {
  font-size: 13px; font-weight: 700; letter-spacing: .03em;
  text-transform: uppercase; color: var(--ink); margin-bottom: 5px;
}
.place-card-desc { font-size: 13px; color: var(--text); line-height: 1.5; }
.place-card-link {
  display: inline-flex; align-items: center; gap: 5px;
  margin-top: 10px; font-size: 11px; font-weight: 600;
  color: var(--accent); text-decoration: none; letter-spacing: .04em;
}
.place-card-link:hover { text-decoration: underline; }
```

```html
<div class="place-card">
  <img src="https://example.com/hotel.jpg" alt="Sofitel Santa Clara" loading="lazy">
  <div class="place-card-body">
    <div class="place-card-name">Sofitel Legend Santa Clara</div>
    <div class="place-card-desc">Former 17th-century convent. Most iconic hotel in Cartagena.</div>
    <a href="https://maps.app.goo.gl/..." target="_blank" class="place-card-link">View on Maps ↗</a>
  </div>
</div>
```

---

## HEADER STRUCTURE

```html
<header class="header">
  <div class="header-eye">Zohoury Family &nbsp;·&nbsp; Travel Report</div>
  <h1><span class="grad grad-main">Report Title</span></h1>
  <div class="header-sub">Version N &nbsp;·&nbsp; Date &nbsp;·&nbsp; Description</div>
  <div class="header-chips">
    <span class="chip chip-green">✓ Status A</span>
    <span class="chip chip-amber">⏳ Status B</span>
    <span class="chip chip-cyan">Key Detail</span>
  </div>
</header>
```

```css
.header {
  margin-bottom: 64px; padding-bottom: 36px;
  border-bottom: 1px solid var(--rule);
}
.header-eye {
  display: flex; align-items: center; gap: 10px;
  font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 18px;
}
.header-eye::before {
  content: ''; display: block; width: 20px; height: 1.5px;
  background: linear-gradient(90deg, var(--accent), transparent);
}
.header h1 {
  font-size: clamp(36px, 6vw, 56px); font-weight: 900;
  letter-spacing: -.03em; line-height: 1.05; margin-bottom: 10px;
}
.header-sub { color: var(--muted); font-size: 15px; margin-bottom: 26px; }
.header-chips { display: flex; flex-wrap: wrap; gap: 8px; }
```

---

## FULL JAVASCRIPT BLOCK

Place everything before `</body>`. Copy-paste ready.

```javascript
// ── THEME TOGGLE ──────────────────────────────────────────────
(function() {
  const html  = document.documentElement;
  const btn   = document.getElementById('themeToggle');
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');

  const saved       = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));

  btn.addEventListener('click', () => {
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
  });

  function applyTheme(theme) {
    html.dataset.theme = theme;
    icon.textContent   = theme === 'dark' ? '☀️' : '🌙';
    label.textContent  = theme === 'dark' ? 'Light mode' : 'Dark mode';
  }
})();

// ── CHECKLIST — localStorage persistence ─────────────────────
function toggleCheck(li) {
  const next = li.dataset.checked !== 'true';
  li.dataset.checked = next;
  localStorage.setItem('check_' + li.dataset.id, next);
}
document.querySelectorAll('.checklist li[data-id]').forEach(li => {
  if (localStorage.getItem('check_' + li.dataset.id) === 'true')
    li.dataset.checked = 'true';
});

// ── INTERSECTION OBSERVER (scroll-in animations) ──────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.card').forEach((card, i) => {
  card.style.transitionDelay = `${(i % 4) * 60}ms`;
  observer.observe(card);
});

// ── CURSOR-TRACKED AMBIENT SPOTLIGHT ──────────────────────────
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width  * 100).toFixed(1) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100).toFixed(1) + '%');
  });
  card.addEventListener('mouseleave', () => {
    card.style.setProperty('--mx', '30%');
    card.style.setProperty('--my', '25%');
  });
});
```

---

## MINIMAL HTML SKELETON

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report Title</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    /* — paste all CSS here — */
  </style>
</head>
<body>

  <!-- Floating theme toggle -->
  <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">
    <span class="theme-toggle-icon" id="themeIcon">🌙</span>
    <span class="theme-toggle-label" id="themeLabel">Dark mode</span>
  </button>

  <div class="container">
    <header class="header">
      <!-- header content -->
    </header>

    <!-- sections -->
  </div>

  <script>
    /* — paste all JavaScript here — */
  </script>
</body>
</html>
```

---

## FEEL & PHILOSOPHY

- **One file, two faces.** The same HTML renders as a clean white editorial document or a dark ops dashboard — whichever the reader prefers, persisted across sessions.
- **CSS variables are the only source of truth.** No hardcoded hex values anywhere in the stylesheet. Every color token flows from `:root` or `[data-theme="dark"]`.
- **Gradients swap with the theme.** Light mode uses deep ink tones (navy→blue→forest green). Dark mode uses neon (lavender→cyan→lime). Both are defined as variables — no class changes needed.
- **Smooth transitions.** The 200ms color transition on `*` makes theme switching feel like a light dimmer, not a flash.
- **Checklists save state.** Every checkbox persists to localStorage using its `data-id`. Close the file, reopen it — everything is exactly as you left it.
- **Interaction is the decoration.** The ambient card spotlight, scroll-in animations, hover lifts, and theme toggle are the only effects. No decorative gradients on backgrounds, no drop shadows on text.
- **Color = meaning.** Blue/cyan = info. Green = done. Amber = pending. Red = urgent. Purple = queued. This is the same in both themes.
