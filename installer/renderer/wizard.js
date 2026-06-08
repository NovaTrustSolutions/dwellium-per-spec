/* Dwellium Installer — wizard renderer logic. */

const STEPS = [
    { id: 'welcome', label: 'Welcome', title: 'Welcome to Dwellium', blurb: 'This wizard installs everything Dwellium needs on this Mac. Click through each section — it installs automatically.' },
    { id: 'prereqs', label: 'Prerequisites', title: 'Prerequisites', blurb: 'Homebrew, Node 20+, git, Python, and uv. Missing items are installed for you.', run: true },
    { id: 'code', label: 'Get the code', title: 'Get the code', blurb: 'Auto-detected — the backend ships bundled with the installer and is extracted to ~/dwellium-backend. Just click Continue.', run: true },
    { id: 'deps', label: 'Dependencies', title: 'Install dependencies', blurb: 'Installs npm packages for the backend and frontend (this can take a few minutes).', run: true },
    { id: 'build', label: 'Build', title: 'Build Dwellium', blurb: 'Compiles and builds the frontend, then stages the runtime.', run: true },
    { id: 'services', label: 'Services', title: 'Start services', blurb: 'Installs background services so Dwellium starts at login, then verifies the backend (:3000) and frontend (:5173).', run: true },
    { id: 'integrations', label: 'Integrations', title: 'Optional integrations', blurb: 'Pick any extras to install now. You can skip and add them later from the app.', run: true },
    { id: 'finish', label: 'Finish', title: 'All set', blurb: 'Dwellium is installed.' },
];

const ctx = {
    repoRoot: null,
    backendTarball: null,
    installDocker: false,
    integrations: { langflow: false, crewai: false, paperclip: false, opennotebook: false, googleoauth: false },
};
const status = {}; // id -> 'done' | 'error'
let idx = 0;
let running = false;

const $ = (id) => document.getElementById(id);
const railEl = $('steps'), bodyEl = $('body'), titleEl = $('title'), blurbEl = $('blurb');
const consoleWrap = $('consoleWrap'), consoleEl = $('console'), consoleStatus = $('consoleStatus');
const primaryBtn = $('primaryBtn'), backBtn = $('backBtn'), progressBar = $('progressBar');

$('stepTotal').textContent = STEPS.length;

// ── Live log streaming ──
let runningId = null;
wizard.onLog(({ id, stream, line }) => {
    if (id !== runningId) return;
    const div = document.createElement('div');
    if (stream === 'err') div.className = 'err';
    if (/^(DONE|✓|🎉)/.test(line)) div.className = 'ok';
    div.textContent = line;
    consoleEl.appendChild(div);
    consoleEl.scrollTop = consoleEl.scrollHeight;
});

function envFor(id) {
    const e = {};
    if (ctx.repoRoot) e.REPO_ROOT = ctx.repoRoot;
    if (id === 'prereqs') e.INSTALL_DOCKER = ctx.installDocker ? '1' : '0';
    if (id === 'code' && ctx.backendTarball) e.BACKEND_TARBALL = ctx.backendTarball;
    if (id === 'integrations') {
        e.I_LANGFLOW = ctx.integrations.langflow ? '1' : '0';
        e.I_CREWAI = ctx.integrations.crewai ? '1' : '0';
        e.I_PAPERCLIP = ctx.integrations.paperclip ? '1' : '0';
        e.I_OPENNOTEBOOK = ctx.integrations.opennotebook ? '1' : '0';
        e.I_GOOGLEOAUTH = ctx.integrations.googleoauth ? '1' : '0';
    }
    return e;
}

// ── Rail ──
function renderRail() {
    railEl.innerHTML = '';
    STEPS.forEach((s, i) => {
        const li = document.createElement('li');
        li.className = 'step' + (i === idx ? ' active' : '') + (status[s.id] === 'done' ? ' done' : '') + (status[s.id] === 'error' ? ' error' : '');
        const dot = status[s.id] === 'done' ? '✓' : status[s.id] === 'error' ? '!' : (i + 1);
        li.innerHTML = `<span class="step-dot">${dot}</span><span>${s.label}</span>`;
        railEl.appendChild(li);
    });
    $('stepNum').textContent = idx + 1;
    progressBar.style.width = `${(idx / (STEPS.length - 1)) * 100}%`;
}

// ── Body renderers ──
function renderBody() {
    const s = STEPS[idx];
    titleEl.textContent = s.title;
    blurbEl.textContent = s.blurb;
    consoleWrap.hidden = !(s.run && (status[s.id] || running));
    bodyEl.innerHTML = '';

    if (s.id === 'welcome') {
        bodyEl.innerHTML = `<ul class="welcome-list">
            <li><span class="ic">▸</span> Installs prerequisites (Homebrew, Node 20+, git, Python, uv)</li>
            <li><span class="ic">▸</span> Sets up the Dwellium frontend + backend and installs dependencies</li>
            <li><span class="ic">▸</span> Builds the app and starts it as a background service</li>
            <li><span class="ic">▸</span> Optionally installs LangFlow, CrewAI, Paperclip, Open Notebook, and Google sync</li>
        </ul>
        <p class="note" style="margin-top:14px">You may be asked for your Mac password during the prerequisites step (Homebrew). Each section runs when you click <b>Continue</b>.</p>`;
    } else if (s.id === 'prereqs') {
        bodyEl.innerHTML = `<div id="tools"><p class="note">Checking what's installed…</p></div>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="dockerChk" ${ctx.installDocker ? 'checked' : ''}/>
            <div><div class="c-title">Also install Docker Desktop</div><div class="c-sub">Only needed for Open Notebook or Paperclip. Large download.</div></div></label>`;
        $('dockerChk').addEventListener('change', (e) => { ctx.installDocker = e.target.checked; });
        refreshPrereqs();
    } else if (s.id === 'code') {
        bodyEl.innerHTML = `
        <div class="field"><label>Dwellium repo folder</label>
            <div class="path-row"><div class="path-val" id="repoVal">Detecting…</div><button class="btn btn-ghost" id="pickRepo">Change…</button></div></div>
        <div class="field"><label>Backend</label>
            <div class="path-row"><div class="path-val" id="tarVal">Detecting…</div><button class="btn btn-ghost" id="pickTar">Change…</button></div></div>
        <p class="note" id="codeNote">Detecting automatically — nothing to choose. Just click Continue.</p>`;
        $('pickRepo').addEventListener('click', async () => { const p = await wizard.pickFolder(); if (p) { ctx.repoRoot = p; ctx.backendAuto = false; $('repoVal').textContent = p; updatePrimary(); } });
        $('pickTar').addEventListener('click', async () => { const p = await wizard.pickFile(); if (p) { ctx.backendTarball = p; ctx.backendAuto = false; $('tarVal').textContent = p; updatePrimary(); } });
        Promise.all([
            ctx.repoRoot ? Promise.resolve(ctx.repoRoot) : wizard.detectRepo(),
            wizard.locateBackend(),
        ]).then(([r, bk]) => {
            if (r && !ctx.repoRoot) ctx.repoRoot = r;
            if (bk && bk.tarball && !ctx.backendTarball) { ctx.backendTarball = bk.tarball; ctx.backendAuto = true; }
            ctx.backendPresent = !!(bk && bk.present);
            const backendOk = !!(ctx.backendTarball || ctx.backendPresent);
            const rv = $('repoVal'), tv = $('tarVal'), nt = $('codeNote');
            if (rv) rv.textContent = ctx.repoRoot || 'Not found — click Change…';
            if (tv) tv.textContent = ctx.backendTarball
                ? (ctx.backendAuto ? '✓ Bundled with installer (automatic)' : ctx.backendTarball)
                : (ctx.backendPresent ? '✓ Already installed at ~/dwellium-backend' : 'Not found — click Change…');
            if (nt) nt.textContent = (ctx.repoRoot && backendOk)
                ? 'Everything detected automatically — just click Continue.'
                : 'Could not auto-detect everything — use Change… for anything marked “Not found”.';
            updatePrimary();
        });
    } else if (s.id === 'integrations') {
        const items = [
            ['langflow', 'LangFlow', 'Visual builder for LangChain flows (uv tool install langflow)'],
            ['crewai', 'CrewAI', 'Multi-agent framework CLI (uv tool install crewai[tools])'],
            ['paperclip', 'Paperclip', 'Agent-orchestration control plane (npx paperclipai onboard)'],
            ['opennotebook', 'Open Notebook', 'Self-hosted NotebookLM (Docker — needs Docker installed)'],
            ['googleoauth', 'Google sync', 'Authorize Gmail + Calendar (opens a browser to sign in)'],
        ];
        bodyEl.innerHTML = items.map(([k, t, d]) =>
            `<label class="check"><input type="checkbox" data-k="${k}" ${ctx.integrations[k] ? 'checked' : ''}/>
                <div><div class="c-title">${t}</div><div class="c-sub">${d}</div></div></label>`).join('') +
            `<p class="note" style="margin-top:8px">Leave all unchecked to skip — you can install these later from the app's tabs.</p>`;
        bodyEl.querySelectorAll('input[data-k]').forEach((cb) => cb.addEventListener('change', (e) => {
            ctx.integrations[e.target.dataset.k] = e.target.checked; updatePrimary();
        }));
    } else if (s.id === 'finish') {
        const okServices = status.services === 'done';
        bodyEl.innerHTML = `
        <p class="note">Dwellium is installed${okServices ? ' and running' : ''}. ${okServices ? 'Open it below.' : 'Start it from the Services step if you skipped it.'}</p>
        <ul class="welcome-list" style="margin-top:10px">
            <li><span class="ic">✓</span> App: <code>http://localhost:5173/</code></li>
            <li><span class="ic">✓</span> Logs: <code>~/Library/Logs/dwellium-{backend,frontend}.out.log</code></li>
            <li><span class="ic">✓</span> Integrations you skipped are available from the app's Terminal and Settings tabs.</li>
        </ul>`;
    } else if (s.run) {
        bodyEl.innerHTML = `<p class="note">${s.blurb}</p>`;
    }
    setFooter();
}

async function refreshPrereqs() {
    const tools = await wizard.checkPrereqs();
    const wrap = $('tools'); if (!wrap) return;
    const names = { brew: 'Homebrew', node: 'Node.js', git: 'git', python3: 'Python 3', uv: 'uv', docker: 'Docker' };
    wrap.innerHTML = Object.keys(names).map((k) => {
        const t = tools[k] || { ok: false };
        return `<div class="tool-row"><span>${names[k]}</span>${t.ok ? `<span class="tool-ver">${(t.version || '').slice(0, 40)}</span><span class="badge badge-ok">installed</span>` : `<span class="badge badge-miss">will install</span>`}</div>`;
    }).join('');
}

// ── Footer / primary button ──
function primaryLabel() {
    const s = STEPS[idx];
    if (status[s.id] === 'error') return 'Retry';
    return {
        welcome: 'Begin',
        prereqs: 'Install prerequisites & Continue',
        code: 'Set up code & Continue',
        deps: 'Install dependencies & Continue',
        build: 'Build Dwellium & Continue',
        services: 'Start services & Continue',
        integrations: anyIntegration() ? 'Install selected & Continue' : 'Skip & Continue',
        finish: 'Open Dwellium',
    }[s.id] || 'Continue';
}
function anyIntegration() { return Object.values(ctx.integrations).some(Boolean); }

function canProceed() {
    const s = STEPS[idx];
    if (s.id === 'code') return !!(ctx.repoRoot && (ctx.backendTarball || ctx.backendPresent));
    return true;
}

function setFooter() {
    primaryBtn.textContent = primaryLabel();
    primaryBtn.disabled = running || !canProceed();
    backBtn.disabled = running || idx === 0;
}
function updatePrimary() { setFooter(); }

// ── Navigation + run ──
function goTo(i) { idx = Math.max(0, Math.min(STEPS.length - 1, i)); renderRail(); renderBody(); }

backBtn.addEventListener('click', () => { if (!running && idx > 0) goTo(idx - 1); });

primaryBtn.addEventListener('click', async () => {
    const s = STEPS[idx];
    if (running) return;
    if (s.id === 'finish') { wizard.openApp('http://localhost:5173/'); return; }
    if (!s.run) { goTo(idx + 1); return; }       // welcome → next
    if (!canProceed()) return;

    // Run this section
    running = true; runningId = s.id;
    consoleEl.innerHTML = ''; consoleWrap.hidden = false;
    consoleStatus.textContent = 'running…';
    primaryBtn.innerHTML = `<span class="spinner"></span>Installing…`;
    primaryBtn.disabled = true; backBtn.disabled = true;

    let res;
    try { res = await wizard.runStep(s.id, envFor(s.id)); }
    catch (e) { res = { ok: false, code: -1 }; const d = document.createElement('div'); d.className = 'err'; d.textContent = String(e); consoleEl.appendChild(d); }

    running = false; runningId = null;
    if (res && res.ok) {
        status[s.id] = 'done';
        consoleStatus.textContent = 'done ✓';
        renderRail();
        setTimeout(() => goTo(idx + 1), 600);
    } else {
        status[s.id] = 'error';
        consoleStatus.textContent = `failed (exit ${res ? res.code : '?'})`;
        renderRail(); setFooter();
        const d = document.createElement('div'); d.className = 'err';
        d.textContent = `▌ Section failed. Fix the issue above (or open a terminal for an interactive step), then click Retry.`;
        consoleEl.appendChild(d);
    }
});

// init
renderRail();
renderBody();
