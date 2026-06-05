/**
 * localShell — a small, honest, client-side command interpreter the Terminal
 * widget falls back to when the backend PTY routes (`/api/terminal/*`) aren't
 * reachable. It does NOT pretend to be a real shell: it runs a handful of real
 * local commands and, for anything that needs a real OS shell (ls, git, …),
 * says so plainly. This turns the widget's "looks alive but does nothing"
 * no-backend state into something usable + truthful.
 *
 * Pure & deterministic (date/now injectable) → unit-testable.
 */

export interface LocalShellResult {
    /** Text to append to the terminal output (already formatted). */
    output: string;
    /** When true, the caller should clear the screen instead of appending. */
    clear?: boolean;
}

export interface LocalShellContext {
    user?: string;
    cwd?: string;
    now?: Date;
}

const OFFLINE_NOTE = 'connect the backend for a full shell';

const HELP = [
    'Offline shell — limited local commands (no backend connected):',
    '  help            show this help',
    '  echo <text>     print text',
    '  date            current date/time',
    '  whoami          current user',
    '  pwd             working directory (virtual)',
    '  clear           clear the screen',
    '  about           about this terminal',
    '',
    `Real commands (ls, git, node, claude, …) need the backend — ${OFFLINE_NOTE}.`,
].join('\n');

/** Run one command line locally. Returns the text to show (or a clear signal). */
export function runLocalCommand(raw: string, ctx: LocalShellContext = {}): LocalShellResult {
    const line = (raw ?? '').trim();
    if (!line) return { output: '' };

    const [cmd, ...rest] = line.split(/\s+/);
    const args = rest.join(' ');

    switch (cmd.toLowerCase()) {
        case 'help':
        case '?':
            return { output: HELP };
        case 'clear':
        case 'cls':
            return { output: '', clear: true };
        case 'echo':
            return { output: args };
        case 'date':
            return { output: (ctx.now ?? new Date()).toString() };
        case 'whoami':
            return { output: ctx.user || 'guest' };
        case 'pwd':
            return { output: ctx.cwd || '~' };
        case 'about':
        case 'ver':
        case 'version':
            return { output: `Dwellium Scribe Terminal — offline mode. ${OFFLINE_NOTE.charAt(0).toUpperCase()}${OFFLINE_NOTE.slice(1)}.` };
        case 'ls':
        case 'dir':
        case 'cat':
        case 'git':
        case 'node':
        case 'npm':
        case 'claude':
            return { output: `${cmd}: needs the backend shell — ${OFFLINE_NOTE}.` };
        default:
            return { output: `${cmd}: command not found (offline mode — type "help"; ${OFFLINE_NOTE}).` };
    }
}
