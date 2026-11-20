import { DEFAULT_TRACERNEST_LOGO, DEFAULT_TRACERNEST_BANNER, DEFAULT_TRACENEST_LOGO, DEFAULT_TRACENEST_BANNER } from '../constants';

function normalizeLogo(logo?: string): string {
    if (!logo)
        return DEFAULT_TRACERNEST_LOGO;
    const trimmed = logo.trim();
    if (trimmed.startsWith('<svg')) {
        return 'data:image/svg+xml;base64,' + Buffer.from(trimmed).toString('base64');
    }
    if (trimmed.startsWith('data:image/svg+xml;utf8,') && (trimmed.includes('"') || trimmed.includes('<'))) {
        const raw = trimmed.slice('data:image/svg+xml;utf8,'.length);
        return 'data:image/svg+xml;base64,' + Buffer.from(raw).toString('base64');
    }
    return trimmed;
}
export function getDashboardHtml(basePath: string, appTitle = 'TracerNest-Logger Console', customLogo?: string): string {
    const effectiveLogo = normalizeLogo(customLogo);
    const isDefaultOrTracerNest = !appTitle || appTitle.toLowerCase().includes('tracernest');
    const brandTitleHtml = isDefaultOrTracerNest ? `
          <span class="brand-title">TracerNest</span>
          <span class="brand-pill">LOGGER</span>` : `
          <span class="brand-title" title="${appTitle}">${appTitle}</span>`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appTitle}</title>
  <link rel="icon" type="image/svg+xml" href="${effectiveLogo}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Sophisticated Midnight Dark Theme */
      --bg-base: #080B12;
      --bg-secondary: #0D111B;
      --bg-surface: #111827;
      --bg-elevated: #172033;
      --bg-hover: #1E293B;

      /* Precision 1px Borders */
      --border: #253047;
      --border-subtle: #1A2436;
      --border-hover: #334155;
      --border-focus: #38BDF8;

      /* Typography Scale & Hierarchy */
      --text-primary: #F1F5F9;
      --text-secondary: #94A3B8;
      --text-muted: #64748B;
      --text-dim: #475569;

      /* Futuristic Minimal Accents */
      --accent-primary: #38BDF8;
      --accent-primary-hover: #0EA5E9;
      --accent-secondary: #6366F1;
      --accent-success: #10B981;
      --accent-warning: #F59E0B;
      --accent-error: #EF4444;

      /* Clean Typefaces */
      --font-sans: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: var(--bg-base); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }

    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: var(--font-sans);
      height: 100vh;
      display: flex;
      overflow: hidden;
      font-feature-settings: "cv02", "cv03", "cv04", "cv11";
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Minimalist Thin-Stroke Lucide-Style Icons */
    .icon {
      width: 16px;
      height: 16px;
      stroke-width: 1.75;
      stroke: currentColor;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      flex-shrink: 0;
      transition: color 0.14s ease;
    }
    .icon-sm { width: 13px; height: 13px; stroke-width: 1.75; }
    .icon-lg { width: 20px; height: 20px; stroke-width: 1.75; }

    /* Left Sidebar (Linear Style) */
    aside {
      width: 240px;
      background: var(--bg-base);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      z-index: 30;
      user-select: none;
    }
    .sidebar-brand {
      padding: 1rem 1.15rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      border-bottom: 1px solid var(--border);
      background: var(--bg-base);
      min-height: 60px;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      min-width: 32px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .brand-mark-custom {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      padding: 2px;
    }
    .brand-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 2px;
    }
    .brand-title-row {
      display: flex;
      align-items: center;
      gap: 6px;
      line-height: 1.2;
    }
    .brand-title {
      font-weight: 600;
      font-size: 0.88rem;
      color: var(--text-primary);
      letter-spacing: -0.015em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .brand-pill {
      font-size: 0.58rem;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: var(--accent-primary);
      letter-spacing: 0.05em;
      font-family: var(--font-mono);
      text-transform: uppercase;
      flex-shrink: 0;
      line-height: 1.3;
    }
    .brand-sub {
      font-size: 0.62rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1;
      display: block;
    }

    .nav-list {
      list-style: none;
      padding: 0.75rem 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      flex: 1;
      overflow-y: auto;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.48rem 0.75rem;
      border-radius: 6px;
      color: var(--text-secondary);
      font-size: 0.82rem;
      font-weight: 400;
      cursor: pointer;
      transition: all 0.12s ease;
      border: 1px solid transparent;
    }
    .nav-item:hover {
      background: var(--bg-surface);
      color: var(--text-primary);
    }
    .nav-item.active {
      background: var(--bg-elevated);
      color: var(--accent-primary);
      font-weight: 500;
      border-color: rgba(56, 189, 248, 0.2);
    }
    .nav-item.active .icon {
      color: var(--accent-primary);
    }

    .sidebar-footer {
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--border);
      background: var(--bg-base);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .user-brief {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      margin-right: 0.5rem;
    }
    .user-brief-name {
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      font-family: var(--font-mono);
    }
    .role-tag {
      font-size: 0.62rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 1px 5px;
      border-radius: 3px;
      width: fit-content;
      margin-top: 2px;
      font-family: var(--font-mono);
    }
    .role-tag.admin { background: rgba(245, 158, 11, 0.1); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.25); }
    .role-tag.operator { background: rgba(99, 102, 241, 0.1); color: #818CF8; border: 1px solid rgba(99, 102, 241, 0.25); }
    .role-tag.auditor { background: rgba(168, 85, 247, 0.1); color: #C084FC; border: 1px solid rgba(168, 85, 247, 0.25); }
    .role-tag.viewer { background: rgba(16, 185, 129, 0.1); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.25); }

    /* Main Canvas */
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-base);
    }

    /* Top Bar (Vercel Style) */
    .topbar {
      height: 52px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1.25rem;
      z-index: 10;
    }
    .topbar-title {
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.75rem;
      letter-spacing: -0.01em;
    }
    .sync-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
      font-size: 0.68rem;
      font-weight: 500;
      font-family: var(--font-mono);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .sync-indicator.synced, .sync-indicator.connected {
      background: rgba(16, 185, 129, 0.08);
      color: #10B981;
      border: 1px solid rgba(16, 185, 129, 0.22);
    }
    .sync-indicator.connecting {
      background: rgba(245, 158, 11, 0.08);
      color: #F59E0B;
      border: 1px solid rgba(245, 158, 11, 0.22);
    }
    .sync-indicator.disconnected {
      background: rgba(239, 68, 68, 0.08);
      color: #EF4444;
      border: 1px solid rgba(239, 68, 68, 0.22);
    }
    .sync-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
    }

    /* Clean Enterprise Buttons (Raycast Style) */
    .btn {
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.38rem 0.75rem;
      font-size: 0.78rem;
      font-weight: 500;
      font-family: var(--font-sans);
      letter-spacing: -0.01em;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      transition: all 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .btn:hover {
      background: var(--bg-elevated);
      border-color: var(--border-hover);
      color: #FFFFFF;
    }
    .btn:active { transform: translateY(1px); }
    .btn-primary {
      background: var(--accent-primary);
      border: 1px solid var(--accent-primary);
      color: #080B12;
      font-weight: 600;
    }
    .btn-primary:hover {
      background: var(--accent-primary-hover);
      border-color: var(--accent-primary-hover);
      color: #080B12;
    }
    .btn-danger {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #EF4444;
    }
    .btn-danger:hover {
      background: #EF4444;
      border-color: #EF4444;
      color: #FFFFFF;
    }
    .btn-icon-only { padding: 0.38rem; border-radius: 6px; }

    /* View Panels */
    .view-panel {
      flex: 1;
      display: none;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-base);
    }
    .view-panel.active {
      display: flex;
    }

    /* Toolbar (Information-Dense & Minimal) */
    .toolbar {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      padding: 0.6rem 1.25rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.65rem;
    }
    .search-box {
      position: relative;
      flex: 1;
      max-width: 380px;
      display: flex;
      align-items: center;
    }
    .search-input {
      width: 100%;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.4rem 4.8rem 0.4rem 2.1rem;
      color: var(--text-primary);
      font-size: 0.78rem;
      font-family: var(--font-mono);
      outline: none;
      transition: all 0.14s ease;
    }
    .search-input:focus {
      border-color: var(--border-focus);
      background: var(--bg-base);
      box-shadow: 0 0 0 1px var(--border-focus);
    }
    .search-icon-embed {
      position: absolute;
      left: 9px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
      display: flex;
      align-items: center;
    }
    .search-actions {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .search-clear-btn {
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.72rem;
      padding: 2px 4px;
      border-radius: 3px;
      display: none;
      line-height: 1;
      transition: all 0.12s;
    }
    .search-clear-btn:hover { color: #FFFFFF; background: rgba(255, 255, 255, 0.1); }
    .search-match {
      background: rgba(245, 158, 11, 0.25);
      color: #FDE68A;
      border: 1px solid rgba(245, 158, 11, 0.45);
      font-weight: 600;
      padding: 0 2px;
      border-radius: 2px;
    }

    .regex-chip {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      font-weight: 600;
      padding: 2px 5px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--bg-surface);
      color: var(--text-muted);
      transition: all 0.12s ease;
    }
    .regex-chip:hover {
      border-color: var(--border-hover);
      color: var(--text-primary);
    }
    .regex-chip.active {
      background: var(--accent-primary);
      color: #080B12;
      border-color: var(--accent-primary);
      font-weight: 700;
    }

    .level-filter-bar {
      display: flex;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
    }
    .filter-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 0.72rem;
      font-weight: 500;
      padding: 0.26rem 0.6rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
    }
    .filter-btn:hover { color: var(--text-primary); background: var(--bg-surface); }
    .filter-btn.active {
      background: var(--bg-elevated);
      color: var(--text-primary);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }
    .filter-btn.active[data-level="error"] { color: var(--accent-error); font-weight: 600; border-bottom: 2px solid var(--accent-error); }
    .filter-btn.active[data-level="warn"] { color: var(--accent-warning); font-weight: 600; border-bottom: 2px solid var(--accent-warning); }
    .filter-btn.active[data-level="info"] { color: var(--accent-primary); font-weight: 600; border-bottom: 2px solid var(--accent-primary); }
    .filter-btn.active[data-level="debug"] { color: #818CF8; font-weight: 600; border-bottom: 2px solid #818CF8; }
    .filter-count {
      font-size: 0.62rem;
      font-family: var(--font-mono);
      background: rgba(255, 255, 255, 0.06);
      padding: 1px 4px;
      border-radius: 9999px;
      margin-left: 4px;
      font-weight: 500;
      color: var(--text-secondary);
    }
    .filter-btn.active .filter-count {
      background: rgba(255, 255, 255, 0.15);
      color: #FFFFFF;
    }

    .filter-select {
      background: var(--bg-base);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-family: var(--font-sans);
      border-radius: 6px;
      padding: 0.35rem 0.65rem;
      outline: none;
      cursor: pointer;
      transition: border-color 0.14s ease;
    }
    .filter-select:hover, .filter-select:focus {
      border-color: var(--border-focus);
      color: var(--text-primary);
    }

    /* Active Filter Summary Bar */
    .active-filters-bar {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      padding: 0.35rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      font-size: 0.72rem;
      color: var(--text-muted);
      user-select: none;
    }
    .active-filter-chips {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.22);
      color: var(--accent-primary);
      font-size: 0.68rem;
      padding: 1px 6px;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--font-mono);
    }
    .filter-chip:hover {
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--accent-primary);
    }
    .filter-chip .chip-close {
      font-weight: 600;
      color: var(--text-muted);
    }
    .filter-chip:hover .chip-close { color: #FFFFFF; }
    .clear-all-link {
      color: var(--text-muted);
      text-decoration: underline;
      cursor: pointer;
      margin-left: 0.5rem;
    }
    .clear-all-link:hover { color: var(--accent-error); }

    /* Sticky Log Column Header */
    .log-column-header {
      display: grid;
      grid-template-columns: 24px 130px 65px 70px 1fr 115px 90px;
      align-items: center;
      padding: 0.4rem 0.9rem;
      background: var(--bg-base);
      border-bottom: 1px solid var(--border);
      font-size: 0.66rem;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-family: var(--font-mono);
      user-select: none;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    /* Log Stream Rows */
    .log-stream {
      flex: 1;
      overflow-y: auto;
      background: var(--bg-base);
      font-family: var(--font-mono);
      font-size: 0.78rem;
    }
    .log-line {
      display: grid;
      grid-template-columns: 24px 130px 65px 70px 1fr 115px 90px;
      align-items: center;
      padding: 0.35rem 0.9rem;
      border-bottom: 1px solid #141C2B;
      border-left: 2px solid transparent;
      cursor: pointer;
      transition: background 0.1s ease;
    }
    .log-line.level-error { border-left-color: var(--accent-error); background: rgba(239, 68, 68, 0.03); }
    .log-line.level-warn { border-left-color: var(--accent-warning); background: rgba(245, 158, 11, 0.02); }
    .log-line.level-info { border-left-color: var(--accent-primary); }
    .log-line.level-debug { border-left-color: var(--accent-secondary); }
    .log-line.source-http { border-left-color: var(--accent-success); }
    .log-line:hover {
      background: var(--bg-secondary) !important;
    }
    .log-stream.density-comfortable .log-line {
      align-items: flex-start;
      padding: 0.52rem 0.9rem;
    }
    .log-stream.density-comfortable .log-content-text {
      white-space: pre-wrap !important;
      word-break: break-word !important;
    }

    /* Empty state */
    .empty-logs-box {
      text-align: center;
      padding: 4rem 1.5rem;
      color: var(--text-muted);
    }
    .empty-logs-box svg {
      width: 36px;
      height: 36px;
      margin: 0 auto 0.75rem auto;
      color: var(--text-dim);
    }
    .empty-logs-title {
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 0.35rem;
      letter-spacing: -0.01em;
    }
    .empty-logs-desc {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-bottom: 1rem;
    }

    .log-toggle-arrow {
      color: var(--text-dim);
      font-size: 0.65rem;
      transition: transform 0.15s ease;
    }
    .log-toggle-arrow.open { transform: rotate(90deg); color: var(--text-primary); }
    .log-timestamp {
      color: var(--text-muted);
      font-size: 0.72rem;
      white-space: nowrap;
      letter-spacing: -0.01em;
    }
    .severity-pill {
      font-size: 0.64rem;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 4px;
      text-transform: uppercase;
      text-align: center;
      width: fit-content;
      letter-spacing: 0.04em;
      font-family: var(--font-mono);
    }
    .pill-error { background: rgba(239, 68, 68, 0.1); color: var(--accent-error); border: 1px solid rgba(239, 68, 68, 0.25); }
    .pill-warn { background: rgba(245, 158, 11, 0.1); color: var(--accent-warning); border: 1px solid rgba(245, 158, 11, 0.25); }
    .pill-info { background: rgba(56, 189, 248, 0.08); color: var(--accent-primary); border: 1px solid rgba(56, 189, 248, 0.22); }
    .pill-debug { background: rgba(99, 102, 241, 0.08); color: #818CF8; border: 1px solid rgba(99, 102, 241, 0.22); }

    .source-label {
      font-size: 0.68rem;
      color: var(--text-dim);
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      letter-spacing: 0.04em;
      font-family: var(--font-mono);
    }
    .source-label.http {
      color: var(--accent-success);
      font-weight: 600;
    }

    .log-content {
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.4;
    }

    /* Expandable Log Details & HTTP Inspector */
    .log-drawer {
      background: var(--bg-base);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      padding: 0.85rem 1.25rem 0.85rem 3.2rem;
      font-size: 0.78rem;
      color: var(--text-secondary);
    }

    /* HTTP Request/Response Inspector Components */
    .http-inspector {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      margin-top: 0.5rem;
    }
    .http-inspector-header {
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      padding: 0.5rem 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .method-badge {
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-family: var(--font-mono);
      letter-spacing: 0.04em;
    }
    .method-GET { background: rgba(56, 189, 248, 0.1); color: var(--accent-primary); border: 1px solid rgba(56, 189, 248, 0.25); }
    .method-POST { background: rgba(16, 185, 129, 0.1); color: var(--accent-success); border: 1px solid rgba(16, 185, 129, 0.25); }
    .method-PUT, .method-PATCH { background: rgba(245, 158, 11, 0.1); color: var(--accent-warning); border: 1px solid rgba(245, 158, 11, 0.25); }
    .method-DELETE { background: rgba(239, 68, 68, 0.1); color: var(--accent-error); border: 1px solid rgba(239, 68, 68, 0.25); }
    .method-ALL, .method-all { background: rgba(168, 85, 247, 0.12); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.25); }

    .status-badge {
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-family: var(--font-mono);
    }
    .status-2xx { background: rgba(16, 185, 129, 0.1); color: var(--accent-success); border: 1px solid rgba(16, 185, 129, 0.25); }
    .status-3xx { background: rgba(99, 102, 241, 0.1); color: #818CF8; border: 1px solid rgba(99, 102, 241, 0.25); }
    .status-4xx { background: rgba(245, 158, 11, 0.1); color: var(--accent-warning); border: 1px solid rgba(245, 158, 11, 0.25); }
    .status-5xx { background: rgba(239, 68, 68, 0.1); color: var(--accent-error); border: 1px solid rgba(239, 68, 68, 0.25); }

    .http-inspector-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-base);
    }
    .payload-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .payload-title-bar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 0.42rem 0.75rem;
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-family: var(--font-mono);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .json-code {
      padding: 0.75rem;
      color: #93C5FD;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      line-height: 1.5;
      overflow-x: auto;
      max-height: 260px;
      white-space: pre-wrap;
      background: var(--bg-base);
    }

    /* Compact API Request Rows (Linear/Raycast Style) */
    .api-row-item {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      transition: all 0.12s ease;
      margin-bottom: 6px;
    }
    .api-row-item:hover {
      border-color: var(--border-hover);
    }
    .api-row-header {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.45rem 0.85rem;
      cursor: pointer;
      user-select: none;
      background: var(--bg-secondary);
      transition: background 0.1s ease;
    }
    .api-row-header:hover {
      background: var(--bg-surface);
    }
    .api-row-url {
      font-family: var(--font-mono);
      font-weight: 500;
      color: var(--text-primary);
      font-size: 0.8rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
    }
    .api-pill {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--bg-base);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .api-pill-ip {
      color: var(--accent-primary);
      border-color: rgba(56, 189, 248, 0.22);
      background: rgba(56, 189, 248, 0.08);
      font-weight: 500;
    }
    .api-row-drawer {
      display: none;
      border-top: 1px solid var(--border);
      background: var(--bg-base);
      padding: 0.75rem;
    }
    .api-row-drawer.open {
      display: block;
    }
    .api-drawer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .client-ip-badge {
      font-size: 0.68rem;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      background: var(--bg-base);
      padding: 1px 5px;
      border-radius: 4px;
      border: 1px solid var(--border);
      white-space: nowrap;
    }

    /* Enterprise Table Design */
    .table-container {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem;
      background: var(--bg-base);
    }
    .enterprise-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.8rem;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .enterprise-table th, .enterprise-table td {
      padding: 0.65rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border-subtle);
    }
    .enterprise-table th {
      color: var(--text-secondary);
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
      font-family: var(--font-mono);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
    }
    .enterprise-table tr:last-child td {
      border-bottom: none;
    }
    .enterprise-table tbody tr {
      transition: background 0.12s ease;
    }
    .enterprise-table tbody tr:hover {
      background: var(--bg-elevated);
    }

    /* Clean Minimalist Cards */
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.65rem;
      border-bottom: 1px solid var(--border);
    }
    .card-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.55rem;
      letter-spacing: -0.015em;
    }
    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .field-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .field-label {
      font-size: 0.72rem;
      font-weight: 500;
      color: var(--text-secondary);
      letter-spacing: 0.01em;
    }
    .input-control {
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.45rem 0.75rem;
      color: var(--text-primary);
      font-size: 0.8rem;
      font-family: var(--font-sans);
      outline: none;
      transition: border-color 0.15s ease;
    }
    .input-control:focus {
      border-color: var(--border-focus);
      background: var(--bg-base);
      box-shadow: 0 0 0 1px var(--border-focus);
    }

    /* Toast Notification */
    .toast-box {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      padding: 0.75rem 1.15rem;
      border-radius: 8px;
      font-size: 0.8rem;
      color: var(--text-primary);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.75);
      z-index: 2000;
      display: none;
      align-items: center;
      gap: 0.65rem;
      backdrop-filter: blur(12px);
    }
    .toast-box.success { border-color: rgba(16, 185, 129, 0.4); background: #061912; }
    .toast-box.error { border-color: rgba(239, 68, 68, 0.4); background: #20080B; }

    /* Dedicated Full-Screen Auth / Login Page */
    .auth-page-screen {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      background: var(--bg-base);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1.5rem;
    }
    .auth-page-screen.hidden {
      display: none !important;
    }
    .onboard-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      width: 100%;
      max-width: 410px;
      box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.85);
      overflow: hidden;
    }

    /* Log Detail Popup Modal */
    .log-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(8, 11, 18, 0.85);
      backdrop-filter: blur(10px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1200;
      padding: 1.5rem;
    }
    .log-modal-overlay.active {
      display: flex;
    }
    
    /* Custom Modern Modal Dialogs (Export, Confirm, Health) */
    .dialog-export {
      max-width: 530px !important;
    }
    .export-scope-card,
    .export-format-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.85rem 0.95rem;
      cursor: pointer;
      transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
      position: relative;
    }
    .export-scope-card:hover,
    .export-format-card:hover {
      border-color: var(--border-hover);
      background: var(--bg-elevated);
      transform: translateY(-1px);
    }
    .export-scope-card.active,
    .export-format-card.active {
      border-color: var(--accent-primary);
      background: rgba(56, 189, 248, 0.08);
      box-shadow: 0 0 0 1px var(--accent-primary), 0 4px 16px -4px rgba(56, 189, 248, 0.15);
    }
    .export-radio-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1.5px solid var(--text-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.14s ease;
      flex-shrink: 0;
    }
    .export-scope-card.active .export-radio-dot,
    .export-format-card.active .export-radio-dot {
      border-color: var(--accent-primary);
      background: var(--accent-primary);
      box-shadow: inset 0 0 0 2.5px var(--bg-surface);
    }
    .dialog-sm {
      max-width: 440px !important;
    }
    
    @keyframes spinAnimation {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .spin-animation {
      animation: spinAnimation 0.8s linear infinite;
    }

    .dialog-md {
      max-width: 580px !important;
    }

    /* Server Health Diagnostic Dialog & Topbar Button Styles */
    .health-diagnostic-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.32rem 0.65rem;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.76rem;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .health-diagnostic-btn:hover {
      background: var(--bg-elevated);
      border-color: var(--border-hover);
      color: var(--text-primary);
    }
    .health-dot {
      width: 7px;
      height: 7px;
      min-width: 7px;
      border-radius: 50%;
      background: var(--accent-success);
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
      display: inline-block;
    }
    .health-dot.degraded {
      background: var(--accent-warning);
      box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
    }
    .health-dot.unhealthy {
      background: var(--accent-error);
      box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
    }
    .diagnostic-pill {
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--accent-primary);
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.25);
      padding: 1px 6px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .diag-dialog {
      max-width: 640px !important;
    }
    .diag-hero-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.15rem;
      padding: 0.95rem 1.15rem;
      background: linear-gradient(135deg, rgba(17, 24, 39, 0.95), rgba(8, 11, 18, 0.95));
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .diag-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-bottom: 1.15rem;
    }
    .diag-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.85rem 1rem;
      transition: border-color 0.15s ease;
    }
    .diag-card:hover {
      border-color: var(--border-hover);
    }
    .diag-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.35rem;
    }
    .diag-value {
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--text-primary);
      font-family: var(--font-mono);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .diag-subtext {
      font-size: 0.68rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
      font-family: var(--font-mono);
    }
    .diag-bar-track {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 0.45rem;
    }
    .diag-bar-fill {
      height: 100%;
      border-radius: 2px;
      background: var(--accent-primary);
      transition: width 0.3s ease;
    }
    .diag-footer-bar {
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 0.7rem 0.95rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }

    .log-modal-container {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      width: 100%;
      max-width: 840px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 50px -10px rgba(0, 0, 0, 0.9);
      overflow: hidden;
      animation: modalFadeIn 0.14s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modalFadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    .log-modal-header {
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid var(--border);
      background: var(--bg-surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .log-modal-body {
      padding: 1.25rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      background: var(--bg-secondary);
    }
    .log-modal-footer {
      padding: 0.75rem 1.25rem;
      border-top: 1px solid var(--border);
      background: var(--bg-surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .log-meta-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.65rem 1rem;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .meta-item-label {
      font-size: 0.62rem;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.05em;
      font-family: var(--font-mono);
      text-transform: uppercase;
    }
    .meta-item-val {
      font-size: 0.78rem;
      font-family: var(--font-mono);
      color: var(--text-primary);
      font-weight: 500;
    }
    .log-modal-section {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .log-modal-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--text-secondary);
      letter-spacing: 0.05em;
      font-family: var(--font-mono);
      text-transform: uppercase;
    }
    .log-modal-code {
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.85rem 1rem;
      font-family: var(--font-mono);
      font-size: 0.76rem;
      line-height: 1.5;
      color: var(--text-primary);
      overflow-x: auto;
      max-height: 280px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .log-content-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
    }
    .log-open-pill {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.68rem;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 4px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--accent-primary);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s ease;
    }
    .log-open-pill:hover {
      background: var(--bg-elevated);
      border-color: var(--accent-primary);
      color: #FFFFFF;
    }
  </style>
</head>
<body>

  <!-- Main Authenticated Dashboard (Hidden until verified) -->
  <div id="appDashboard" style="display:none; width:100vw; height:100vh; overflow:hidden;">

  <!-- Left Sidebar Navigation -->
  <aside>
    <div class="sidebar-brand">
      <div class="brand-mark brand-mark-custom" style="padding:2px; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:7px;">
        <img src="${effectiveLogo}" alt="TracerNest Logo" style="width:100%; height:100%; object-fit:contain; border-radius:5px; display:block;" />
      </div>
      <div class="brand-text">
        <div class="brand-title-row">
${brandTitleHtml}
        </div>
        <span class="brand-sub">SQL Secured &bull; RBAC</span>
      </div>
    </div>

    <ul class="nav-list">
      <li class="nav-item active" data-view="logs" onclick="switchView('logs')">
        <svg class="icon" viewBox="0 0 24 24"><path d="M4 17l6-5-6-5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        <span>Terminal Logs</span>
      </li>
      <li class="nav-item" id="navApis" data-view="apis" onclick="switchView('apis')">
        <svg class="icon" viewBox="0 0 24 24"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>
        <span>API Requests & Responses</span>
      </li>
      <li class="nav-item" id="navExclusions" data-view="exclusions" onclick="switchView('exclusions')">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        <span>Skip Sensitive APIs</span>
      </li>
      <li class="nav-item" id="navUsers" data-view="users" onclick="switchView('users')">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>
        <span>Manage Users</span>
      </li>
      <li class="nav-item" id="navAlerts" data-view="alerts" onclick="switchView('alerts')">
        <svg class="icon" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span>Alert Integrations</span>
      </li>
      <li class="nav-item" id="navTtl" data-view="ttl" onclick="switchView('ttl')">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <span>TTL & Retention</span>
      </li>
      <li class="nav-item" id="navAudit" data-view="audit" onclick="switchView('audit')">
        <svg class="icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
        <span>Security Audit</span>
      </li>
      <li class="nav-item" data-view="metrics" onclick="switchView('metrics')">
        <svg class="icon" viewBox="0 0 24 24"><path d="M2 12h4l3-8 4 16 3-8h6"/></svg>
        <span>System Metrics</span>
      </li>
    </ul>

    <div class="sidebar-footer">
      <div class="user-brief">
        <span id="sideUsername" class="user-brief-name">Not Authenticated</span>
        <span id="sideRoleBadge" class="role-tag viewer">Viewer</span>
      </div>
      <button class="btn btn-icon-only" title="Sign Out" onclick="handleLogout()">
        <svg class="icon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  </aside>

  <!-- Main Canvas -->
  <main>
    <!-- Top Bar -->
    <div class="topbar">
      <div class="topbar-title">
        <span id="currentViewTitle">Terminal Logs Stream</span>
        <div id="syncBadge" class="sync-indicator connecting">
          <span class="sync-dot"></span>
          <span id="syncText">Connecting...</span>
        </div>
        <button id="healthBadge" class="health-diagnostic-btn" onclick="runHealthDiagnostic()" title="Click to run live Server Health & Telemetry Diagnostic">
          <span class="sync-dot health-dot" id="topbarHealthDot" style="background:#10b981;"></span>
          <span id="healthText" style="font-weight:600;">Health: OK</span>
          <span class="diagnostic-pill">
            <svg class="icon icon-xs" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span>Run Diagnostic</span>
          </span>
        </button>
      </div>

      <div style="display:flex; align-items:center; gap:0.5rem;" id="topbarActions">
        <button id="btnSimulateApi" class="btn btn-primary" onclick="triggerSimulatedApi()" title="Trigger a live POST /api/orders request with JSON request & response">
          <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <span>Simulate API Call</span>
        </button>
        <button id="btnAutoScroll" class="btn btn-primary" onclick="toggleAutoScroll()">
          <span>Auto-Scroll: ON</span>
        </button>
        <button id="btnPause" class="btn" onclick="togglePauseStream()">
          <span id="pauseIcon"><svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg></span> <span id="pauseText">Pause</span>
        </button>
        <button id="btnClear" class="btn btn-danger" onclick="confirmClearLogs()" style="display:none;">
          <svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Clear Buffer</span>
        </button>
        <button id="btnExport" class="btn" onclick="openExportMenu()" style="display:none;" title="Export logs as JSON, CSV or NDJSON">
          <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Export</span>
        </button>
      </div>
    </div>

    <!-- VIEW 1: TERMINAL & HTTP LOGS (Errsole-Grade Listing & Search) -->
    <div id="viewLogs" class="view-panel active">
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon-embed">
            <svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/></svg>
          </span>
          <input type="text" id="searchInput" class="search-input" placeholder="Search message, URL, IP, or JSON... (/)" oninput="handleSearchInput()">
          <div class="search-actions">
            <span id="searchClearBtn" class="search-clear-btn" onclick="clearSearchInput()" title="Clear Search">&times;</span>
            <span id="regexChip" class="regex-chip" onclick="toggleRegex()" title="Toggle Regular Expression Mode">.*</span>
          </div>
        </div>

        <!-- Level Filter Pills with Real-Time Counters -->
        <div class="level-filter-bar">
          <button class="filter-btn active" data-level="all" onclick="setLevelFilter('all')">
            ALL <span id="countAll" class="filter-count">0</span>
          </button>
          <button class="filter-btn" data-level="http" onclick="setLevelFilter('http')" style="color:#38bdf8;">
            HTTP <span id="countHttp" class="filter-count">0</span>
          </button>
          <button class="filter-btn" data-level="error" onclick="setLevelFilter('error')">
            ERR <span id="countError" class="filter-count">0</span>
          </button>
          <button class="filter-btn" data-level="warn" onclick="setLevelFilter('warn')">
            WARN <span id="countWarn" class="filter-count">0</span>
          </button>
          <button class="filter-btn" data-level="info" onclick="setLevelFilter('info')">
            INFO <span id="countInfo" class="filter-count">0</span>
          </button>
          <button class="filter-btn" data-level="debug" onclick="setLevelFilter('debug')">
            DEBUG <span id="countDebug" class="filter-count">0</span>
          </button>
        </div>

        <!-- Time Range Preset Selector (Errsole Style) -->
        <select id="timeRangeFilter" class="filter-select" onchange="handleTimeRangeFilter()" title="Filter logs by time range">
          <option value="all">All Time</option>
          <option value="15m">Last 15 mins</option>
          <option value="1h">Last 1 hour</option>
          <option value="6h">Last 6 hours</option>
          <option value="24h">Last 24 hours</option>
        </select>

        <!-- Source Origin Filter -->
        <select id="sourceFilter" class="filter-select" onchange="handleSourceFilter()" title="Filter by log origin">
          <option value="all">All Sources</option>
          <option value="stdout">stdout</option>
          <option value="stderr">stderr</option>
          <option value="http">http (APIs)</option>
          <option value="api">api</option>
        </select>

        <div style="margin-left:auto; display:flex; align-items:center; gap:0.45rem;">
          <!-- Density Mode Toggle -->
          <button id="btnDensity" class="btn" style="font-size:0.75rem; padding:0.32rem 0.65rem;" onclick="toggleDisplayDensity()" title="Toggle Compact / Comfortable Density">
            <span id="densityText">Compact</span>
          </button>
          <!-- Sort Order Button -->
          <button id="btnSortOrder" class="btn" style="font-size:0.75rem; padding:0.32rem 0.65rem;" onclick="toggleSortOrder()" title="Toggle Sorting Order (Time)">
            <svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
            <span id="sortOrderText">Time: Newest First ▾</span>
          </button>
        </div>
      </div>

      <!-- Active Filter Status & Match Summary Bar -->
      <div id="activeFilterSummary" class="active-filters-bar">
        <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
          <span>Showing <strong id="matchingCount" style="color:#fff;">0</strong> of <strong id="totalBufferCount" style="color:var(--text-secondary);">0</strong> logs</span>
          <div id="activeFilterChips" class="active-filter-chips"></div>
        </div>
        <div style="display:flex; align-items:center; gap:0.65rem;">
          <span id="clearFiltersBtn" class="clear-all-link" style="display:none;" onclick="clearAllFilters()">Clear All Filters</span>
          <span style="color:#334155;">|</span>
          <span id="streamStatusText" style="color:#10b981; font-weight:600; font-size:0.7rem;">● Live Stream</span>
        </div>
      </div>

      <!-- Sticky Column Headers (Errsole Style) -->
      <div class="log-column-header">
        <span></span>
        <span>TIMESTAMP</span>
        <span>LEVEL</span>
        <span>SOURCE</span>
        <span>MESSAGE & HTTP DETAILS</span>
        <span>CLIENT IP</span>
        <span style="text-align:right;">ACTION</span>
      </div>

      <div id="logStream" class="log-stream">
        <div id="logList"></div>
      </div>
    </div>

    <!-- VIEW: API REQUESTS & RESPONSES EXPLORER -->
    <div id="viewApis" class="view-panel">
      <div style="padding:1.25rem 1.5rem; overflow-y:auto; height:calc(100vh - 65px);">
        <!-- API Stats KPI Bar -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.25rem;">
          <div class="card" style="padding:1rem;">
            <div style="color:var(--text-muted); font-size:0.75rem; font-weight:600; text-transform:uppercase;">Total Intercepted Calls</div>
            <div id="kpiTotalApis" style="font-size:1.6rem; font-weight:700; color:#38bdf8; margin-top:0.25rem;">0</div>
          </div>
          <div class="card" style="padding:1rem;">
            <div style="color:var(--text-muted); font-size:0.75rem; font-weight:600; text-transform:uppercase;">Successful (2xx)</div>
            <div id="kpiSuccessApis" style="font-size:1.6rem; font-weight:700; color:#10b981; margin-top:0.25rem;">0</div>
          </div>
          <div class="card" style="padding:1rem;">
            <div style="color:var(--text-muted); font-size:0.75rem; font-weight:600; text-transform:uppercase;">Client / Server Errors</div>
            <div id="kpiErrorApis" style="font-size:1.6rem; font-weight:700; color:#ef4444; margin-top:0.25rem;">0</div>
          </div>
          <div class="card" style="padding:1rem;">
            <div style="color:var(--text-muted); font-size:0.75rem; font-weight:600; text-transform:uppercase;">Avg Response Time</div>
            <div id="kpiAvgLatency" style="font-size:1.6rem; font-weight:700; color:#fbbf24; margin-top:0.25rem;">0ms</div>
          </div>
        </div>

        <!-- Toolbar: Method Filters & Search -->
        <div class="toolbar" style="margin-bottom:1rem; padding:0.65rem 0.85rem; background:#0a0f1d; border:1px solid var(--border-subtle); border-radius:8px;">
          <div class="search-box" style="max-width:320px;">
            <span class="search-icon-embed">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/></svg>
            </span>
            <input type="text" id="apiSearchInput" class="search-input" placeholder="Filter by URL, payload, IP... (/)" oninput="handleApiSearchInput()">
            <div class="search-actions">
              <span id="apiSearchClearBtn" class="search-clear-btn" onclick="clearApiSearchInput()" title="Clear Search">&times;</span>
            </div>
          </div>

          <div class="level-filter-bar">
            <button class="filter-btn active" data-api-method="all" onclick="setApiMethodFilter('all')">
              ALL <span id="apiCountAll" class="filter-count">0</span>
            </button>
            <button class="filter-btn" data-api-method="POST" onclick="setApiMethodFilter('POST')">
              POST <span id="apiCountPost" class="filter-count">0</span>
            </button>
            <button class="filter-btn" data-api-method="GET" onclick="setApiMethodFilter('GET')">
              GET <span id="apiCountGet" class="filter-count">0</span>
            </button>
            <button class="filter-btn" data-api-method="PUT" onclick="setApiMethodFilter('PUT')">
              PUT <span id="apiCountPut" class="filter-count">0</span>
            </button>
            <button class="filter-btn" data-api-method="DELETE" onclick="setApiMethodFilter('DELETE')">
              DELETE <span id="apiCountDelete" class="filter-count">0</span>
            </button>
            <button class="filter-btn" data-api-method="ERRORS" onclick="setApiMethodFilter('ERRORS')" style="color:#ef4444;">
              ERRORS <span id="apiCountErrors" class="filter-count">0</span>
            </button>
          </div>

          <!-- Status Code Filter -->
          <select id="apiStatusFilter" class="filter-select" onchange="renderApiList()" title="Filter by HTTP Status Code">
            <option value="all">All Statuses</option>
            <option value="2xx">2xx Success</option>
            <option value="3xx">3xx Redirect</option>
            <option value="4xx">4xx Client Error</option>
            <option value="5xx">5xx Server Error</option>
          </select>

          <!-- Latency Filter -->
          <select id="apiLatencyFilter" class="filter-select" onchange="renderApiList()" title="Filter by Latency">
            <option value="all">All Latencies</option>
            <option value="fast">&lt; 50ms</option>
            <option value="moderate">&gt; 100ms</option>
            <option value="slow">&gt; 500ms</option>
          </select>

          <div style="margin-left:auto; display:flex; align-items:center; gap:0.5rem;">
            <button class="btn" style="font-size:0.75rem; padding:0.32rem 0.65rem;" onclick="switchView('exclusions')" title="Configure sensitive APIs to skip tracking">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              <span>Skip Sensitive APIs</span>
            </button>
            <button id="btnApiSortOrder" class="btn" style="font-size:0.75rem; padding:0.32rem 0.65rem;" onclick="toggleApiSortOrder()" title="Toggle API Sorting Order (Time)">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
              <span id="apiSortOrderText">Time: Newest First ▾</span>
            </button>
            <button class="btn btn-primary" onclick="triggerSimulatedApi()">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>Simulate Live Order API</span>
            </button>
          </div>
        </div>

        <!-- List of API Requests & Responses Cards -->
        <div id="apiCardsList" style="display:flex; flex-direction:column; gap:0.5rem;">
          <!-- Populated dynamically -->
        </div>
      </div>
    </div>

    <!-- VIEW 2: MANAGE USERS -->
    <div id="viewUsers" class="view-panel">
      <div class="table-container">
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              <span>Create New User</span>
            </div>
          </div>
          <form id="createUserForm" onsubmit="handleCreateUser(event)">
            <div class="form-row">
              <div class="field-group">
                <label class="field-label">Username</label>
                <input type="text" id="newUsername" class="input-control" placeholder="e.g. devops_auditor" required>
              </div>
              <div class="field-group">
                <label class="field-label">Password</label>
                <input type="password" id="newPassword" class="input-control" placeholder="Min 6 characters" required>
              </div>
              <div class="field-group">
                <label class="field-label">Role (RBAC)</label>
                <select id="newRole" class="input-control">
                  <option value="viewer">Viewer (Read & Stream)</option>
                  <option value="operator">Operator (Read, Stream, Export)</option>
                  <option value="auditor">Auditor (Read, Export, Security Trail)</option>
                  <option value="admin">Admin (Full Control)</option>
                </select>
              </div>
            </div>
            <button type="submit" class="btn btn-primary">Create User Account</button>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></svg>
              <span>Persisted User Accounts (SQL Encrypted)</span>
            </div>
          </div>
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Assigned Role</th>
                <th>Created</th>
                <th>Last Login</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="usersTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- VIEW 3: ALERT INTEGRATIONS -->
    <div id="viewAlerts" class="view-panel">
      <div class="table-container">

        <!-- Microsoft Teams Webhook Integration -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="3"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>
              <span>Microsoft Teams Webhook Alert Integration</span>
            </div>
            <span class="role-tag auditor" style="font-size:0.7rem;">AES-256-GCM Encrypted</span>
          </div>

          <form id="teamsForm" onsubmit="handleSaveTeams(event)">
            <div class="form-row">
              <div class="field-group" style="grid-column: span 2;">
                <label class="field-label">Webhook URL (AES-256-GCM Encrypted)</label>
                <input type="password" id="teamsWebhookUrl" class="input-control" placeholder="https://outlook.office.com/webhook/..." required>
              </div>
              <div class="field-group">
                <label class="field-label">Alert Channel Name / Header</label>
                <input type="text" id="teamsTitle" class="input-control" placeholder="Production Backend Incident">
              </div>
            </div>
            <div class="form-row">
              <div class="field-group">
                <label class="field-label">Trigger Severity Threshold</label>
                <select id="teamsThreshold" class="input-control">
                  <option value="error">ERROR Only (Critical)</option>
                  <option value="warn">WARN and ERROR</option>
                  <option value="all">ALL Levels</option>
                </select>
              </div>
              <div class="field-group">
                <label class="field-label">Status</label>
                <select id="teamsEnabled" class="input-control">
                  <option value="1">Enabled (Active)</option>
                  <option value="0">Disabled</option>
                </select>
              </div>
            </div>
            <div style="display:flex; gap:0.6rem;">
              <button type="submit" class="btn btn-primary">Save Teams Configuration</button>
              <button type="button" class="btn" onclick="triggerTestAlert('teams')">Send Test Alert to Teams</button>
            </div>
          </form>
        </div>

        <!-- Email (SMTP) Integration -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/></svg>
              <span>Email Incident Alerts (SMTP)</span>
            </div>
            <span class="role-tag auditor" style="font-size:0.7rem;">AES-256-GCM Encrypted</span>
          </div>

          <form id="emailForm" onsubmit="handleSaveEmail(event)">
            <div class="form-row">
              <div class="field-group">
                <label class="field-label">SMTP Host</label>
                <input type="text" id="smtpHost" class="input-control" placeholder="smtp.office365.com / smtp.gmail.com" required>
              </div>
              <div class="field-group">
                <label class="field-label">Port</label>
                <input type="number" id="smtpPort" class="input-control" value="587" required>
              </div>
              <div class="field-group">
                <label class="field-label">Security Protocol</label>
                <select id="smtpSecure" class="input-control">
                  <option value="0">STARTTLS (Port 587)</option>
                  <option value="1">Direct TLS/SSL (Port 465)</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="field-group">
                <label class="field-label">SMTP Username / Email</label>
                <input type="text" id="smtpUser" class="input-control" placeholder="alerts@company.com">
              </div>
              <div class="field-group">
                <label class="field-label">SMTP Password / App Key (Encrypted in SQL)</label>
                <input type="password" id="smtpPass" class="input-control" placeholder="••••••••••••">
              </div>
            </div>
            <div class="form-row">
              <div class="field-group">
                <label class="field-label">From Address</label>
                <input type="text" id="smtpFrom" class="input-control" placeholder="TracerNest-Logger Alerts <alerts@company.com>" required>
              </div>
              <div class="field-group">
                <label class="field-label">Recipients (To)</label>
                <input type="text" id="smtpTo" class="input-control" placeholder="devops@company.com, oncall@company.com" required>
              </div>
              <div class="field-group">
                <label class="field-label">Severity Threshold</label>
                <select id="smtpThreshold" class="input-control">
                  <option value="error">ERROR Only (Default)</option>
                  <option value="warn">WARN and ERROR</option>
                  <option value="all">ALL Levels</option>
                </select>
              </div>
              <div class="field-group">
                <label class="field-label">Integration State</label>
                <select id="smtpEnabled" class="input-control">
                  <option value="1">Enabled</option>
                  <option value="0">Disabled</option>
                </select>
              </div>
            </div>
            <div style="display:flex; gap:0.6rem;">
              <button type="submit" class="btn btn-primary">Save Email Configuration</button>
              <button type="button" class="btn" onclick="triggerTestAlert('email')">Send Test Email</button>
            </div>
          </form>
        </div>

      </div>
    </div>

    <!-- VIEW 4: TTL & RETENTION POLICIES -->
    <div id="viewTtl" class="view-panel">
      <div class="table-container">

        <!-- Add TTL Rule -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>Add Time-To-Live (TTL) Log Deletion Rule</span>
            </div>
            <button class="btn btn-danger" onclick="triggerManualSweep()">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span>Purge Expired Logs Now</span>
            </button>
          </div>

          <form id="ttlRuleForm" onsubmit="handleCreateTTLRule(event)">
            <div class="form-row">
              <div class="field-group">
                <label class="field-label">Rule Label / Name</label>
                <input type="text" id="ttlRuleName" class="input-control" placeholder="e.g. Purge Health Checks" required>
              </div>
              <div class="field-group">
                <label class="field-label">Target Severity Level</label>
                <select id="ttlRuleLevel" class="input-control">
                  <option value="all">ALL Levels</option>
                  <option value="debug">DEBUG Only</option>
                  <option value="info">INFO Only</option>
                  <option value="warn">WARN Only</option>
                  <option value="error">ERROR Only</option>
                </select>
              </div>
              <div class="field-group">
                <label class="field-label">Target Log Source</label>
                <select id="ttlRuleSource" class="input-control">
                  <option value="all">ALL Sources</option>
                  <option value="http">HTTP Requests & Responses</option>
                  <option value="stdout">stdout (Terminal)</option>
                  <option value="stderr">stderr (Terminal)</option>
                  <option value="api">Programmatic API</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="field-group">
                <label class="field-label">Message / URL Pattern (Optional Regex or Text)</label>
                <input type="text" id="ttlRulePattern" class="input-control" placeholder="e.g. /healthz or ping or Redis cache">
              </div>
              <div class="field-group">
                <label class="field-label">Retention Duration (TTL)</label>
                <div style="display:flex; gap:0.5rem;">
                  <input type="number" id="ttlDurationVal" class="input-control" value="60" min="1" required style="width:100px;">
                  <select id="ttlDurationUnit" class="input-control" style="flex:1;">
                    <option value="60">Minutes</option>
                    <option value="3600">Hours</option>
                    <option value="86400">Days</option>
                    <option value="1">Seconds</option>
                  </select>
                </div>
              </div>
            </div>
            <button type="submit" class="btn btn-primary">Save TTL Policy Rule</button>
          </form>
        </div>

        <!-- Active TTL Rules Table -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span>Active Retention Rules</span>
            </div>
            <span id="ttlPurgedBadge" style="font-size:0.75rem; color:#38bdf8; font-weight:600; font-family:var(--font-mono);">
              Total Purged: 0 logs
            </span>
          </div>

          <table class="enterprise-table">
            <thead>
              <tr>
                <th>Rule Name</th>
                <th>Level</th>
                <th>Source</th>
                <th>Pattern / URL</th>
                <th>TTL Duration</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="ttlTableBody"></tbody>
          </table>
        </div>

      </div>
    </div>

    <!-- VIEW 5: SECURITY AUDIT LOGS -->
    <div id="viewAudit" class="view-panel">
      <div class="table-container">
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
              <span>Security Event Trail</span>
            </div>
          </div>
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Operator</th>
                <th>Client IP</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody id="auditTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- VIEW 6: METRICS & HEALTH -->
    <div id="viewMetrics" class="view-panel">
      <div class="table-container">
        <!-- Server Health Check Diagnostic Panel -->
        <div class="card" style="margin-bottom:1.25rem;">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              <span>Server Health Check & Diagnostics</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.65rem;">
              <span id="healthCardStatus" class="role-tag admin" style="background:rgba(16,185,129,0.18); color:#34d399; border-color:rgba(16,185,129,0.35); padding:3px 8px; font-weight:600; font-size:0.72rem;">HEALTHY</span>
              <button id="btnRunDiagnostic" class="btn btn-primary" onclick="runHealthDiagnostic()" title="Run live system health & telemetry diagnostics" style="font-weight:600; font-size:0.78rem; padding:0.42rem 0.95rem; box-shadow:0 1px 3px rgba(0,0,0,0.35);">
                <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                <span id="btnRunDiagnosticLabel">Run Diagnostic</span>
              </button>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">System Uptime</div>
              <div id="healthCardUptime" style="font-size:1.3rem; font-weight:700; color:#38bdf8; font-family:var(--font-mono); margin-top:0.3rem;">-</div>
            </div>
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Database Engine</div>
              <div id="healthCardDb" style="font-size:1.3rem; font-weight:700; color:#34d399; font-family:var(--font-mono); margin-top:0.3rem;">SQLITE (CONNECTED)</div>
            </div>
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Runtime Platform</div>
              <div id="healthCardNode" style="font-size:1.3rem; font-weight:700; color:#cbd5e1; font-family:var(--font-mono); margin-top:0.3rem;">-</div>
            </div>
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Automated Log Retention</div>
              <div style="font-size:1.3rem; font-weight:700; color:#a855f7; font-family:var(--font-mono); margin-top:0.3rem;">ACTIVE SWEEP</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <span>Engine Status & Metrics</span>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Throughput</div>
              <div id="mThroughput" style="font-size:1.4rem; font-weight:700; color:#38bdf8; font-family:var(--font-mono); margin-top:0.3rem;">0 /s</div>
            </div>
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Buffer Size</div>
              <div id="mTotal" style="font-size:1.4rem; font-weight:700; color:#fff; font-family:var(--font-mono); margin-top:0.3rem;">0</div>
            </div>
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Error Count</div>
              <div id="mErrors" style="font-size:1.4rem; font-weight:700; color:#ef4444; font-family:var(--font-mono); margin-top:0.3rem;">0</div>
            </div>
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Expired / Purged</div>
              <div id="mPurged" style="font-size:1.4rem; font-weight:700; color:#a855f7; font-family:var(--font-mono); margin-top:0.3rem;">0</div>
            </div>
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Heap Memory</div>
              <div id="mHeap" style="font-size:1.4rem; font-weight:700; color:#10b981; font-family:var(--font-mono); margin-top:0.3rem;">0 MB</div>
            </div>
            <div style="background:#070c17; border:1px solid var(--border-subtle); padding:1rem; border-radius:6px;">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Buffer Usage</div>
              <div id="mBuffer" style="font-size:1.4rem; font-weight:700; color:#fbbf24; font-family:var(--font-mono); margin-top:0.3rem;">0%</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- VIEW 7: SKIP SENSITIVE APIS / ROUTE EXCLUSIONS -->
    <div id="viewExclusions" class="view-panel">
      <div class="table-container">

        <!-- Informational Banner -->
        <div style="background:linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%); border:1px solid rgba(56, 189, 248, 0.2); border-radius:8px; padding:1rem 1.25rem; margin-bottom:1.25rem; display:flex; align-items:flex-start; gap:0.85rem;">
          <div style="width:32px; height:32px; border-radius:6px; background:rgba(56, 189, 248, 0.15); display:flex; align-items:center; justify-content:center; color:#38bdf8; flex-shrink:0; margin-top:2px;">
            <svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </div>
          <div>
            <div style="font-weight:600; font-size:0.88rem; color:#fff; margin-bottom:0.25rem;">Real-Time Sensitive Route Filtering</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); line-height:1.45;">
              Excluded routes are completely skipped and ignored by TracerNest Logger. No request or response payloads, headers, or timestamps will be stored or recorded in SQLite/MySQL.
              Rules take effect immediately in real-time without restarting your Node.js application.
            </div>
          </div>
        </div>

        <!-- Add Sensitive Route Exclusion Form -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>Add Sensitive Route to Skip Tracking</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">
              Supports exact paths or wildcards (e.g. /api/auth/*)
            </div>
          </div>

          <form id="exclusionRuleForm" onsubmit="handleCreateExcludedRoute(event)">
            <div class="form-row">
              <div class="field-group" style="flex:0 0 160px;">
                <label class="field-label">HTTP Method</label>
                <select id="exclMethod" class="input-control">
                  <option value="ALL">ALL Methods</option>
                  <option value="POST">POST Only</option>
                  <option value="GET">GET Only</option>
                  <option value="PUT">PUT Only</option>
                  <option value="PATCH">PATCH Only</option>
                  <option value="DELETE">DELETE Only</option>
                </select>
              </div>
              <div class="field-group" style="flex:1;">
                <label class="field-label">API Route Path or Pattern <span style="color:#ef4444;">*</span></label>
                <input type="text" id="exclPath" class="input-control" placeholder="e.g. /api/auth/login or /api/v1/checkout/*" required style="font-family:var(--font-mono);">
              </div>
              <div class="field-group" style="flex:1.2;">
                <label class="field-label">Description / Privacy Reason (Optional)</label>
                <input type="text" id="exclDesc" class="input-control" placeholder="e.g. Customer payment card credentials & CVV">
              </div>
            </div>

            <!-- Preset Quick Add Buttons -->
            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.5rem; margin-top:0.75rem; margin-bottom:1rem;">
              <span style="font-size:0.72rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Quick Presets:</span>
              <button type="button" class="btn" style="padding:2px 8px; font-size:0.7rem;" onclick="applyExclusionPreset('/api/auth/*', 'ALL', 'Authentication, tokens, and password credentials')">+ /api/auth/* (Auth & Login)</button>
              <button type="button" class="btn" style="padding:2px 8px; font-size:0.7rem;" onclick="applyExclusionPreset('/api/v1/checkout/*', 'POST', 'Payment checkout & credit card tokens')">+ /api/v1/checkout/* (Payments)</button>
              <button type="button" class="btn" style="padding:2px 8px; font-size:0.7rem;" onclick="applyExclusionPreset('/healthz', 'GET', 'Internal infrastructure health check ping')">+ /healthz (Health Checks)</button>
              <button type="button" class="btn" style="padding:2px 8px; font-size:0.7rem;" onclick="applyExclusionPreset('/metrics', 'GET', 'Prometheus telemetry scraping')">+ /metrics (Telemetry)</button>
            </div>

            <button type="submit" class="btn btn-primary" id="btnSaveExclusionRule">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <span>Add Exclusion Rule</span>
            </button>
          </form>
        </div>

        <!-- Active Excluded Routes Table Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg class="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span>Configured API Exclusion Rules</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.65rem;">
              <span id="exclActiveBadge" style="font-size:0.75rem; color:#38bdf8; font-weight:600; font-family:var(--font-mono);">
                0 Active Rules
              </span>
              <span id="exclStaticBadge" style="font-size:0.72rem; color:var(--text-muted); font-family:var(--font-mono);">
                (0 Static Config Rules)
              </span>
            </div>
          </div>

          <table class="enterprise-table">
            <thead>
              <tr>
                <th style="width:110px;">Method</th>
                <th>Route Path / Pattern</th>
                <th>Description / Reason</th>
                <th style="width:140px;">Status</th>
                <th style="width:130px;">Created</th>
                <th style="width:160px; text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody id="excludedRoutesTableBody"></tbody>
          </table>
        </div>

      </div>
    </div>

  </main>
  </div> <!-- /appDashboard -->

  <!-- Dedicated Full-Screen Login & Setup Page -->
  <div id="authScreen" class="auth-page-screen">
    <!-- First-Time Onboarding Card -->
    <div id="setupModal" class="onboard-card" style="display:none;">
      <div style="padding:1.75rem 1.75rem 0.6rem 1.75rem; text-align:center;">
        <div style="width:52px; height:52px; margin:0 auto 0.85rem auto; border-radius:10px; overflow:hidden; border:1px solid var(--border); background:#030712; padding:3px; box-shadow:0 4px 16px rgba(2, 132, 199, 0.35);">
          <img src="${effectiveLogo}" alt="TracerNest-Logger Logo" style="width:100%; height:100%; object-fit:contain;" />
        </div>
        <h3 style="font-size:1.22rem; font-weight:700; color:#fff; letter-spacing:-0.02em; display:flex; align-items:center; justify-content:center; gap:6px;"><span>Welcome to TracerNest</span><span class="brand-pill" style="font-size:0.62rem;">LOGGER</span></h3>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.4rem; line-height:1.5;">
          No administrative accounts exist. Create your root administrator to initialize the encrypted SQL database.
        </p>
      </div>
      <form id="setupForm" onsubmit="handleInitialSetup(event)" style="padding:1.25rem 1.75rem 1.75rem 1.75rem;">
        <div id="setupErrorMsg" style="display:none; margin-bottom:1rem; padding:0.65rem 0.85rem; border-radius:6px; background:#450a0a; border:1px solid #7f1d1d; color:#fca5a5; font-size:0.8rem; line-height:1.4;"></div>
        <div class="field-group" style="margin-bottom:0.9rem;">
          <label class="field-label">Administrator Username</label>
          <input type="text" id="setupUsername" class="input-control" value="admin" required autocomplete="username">
        </div>
        <div class="field-group" style="margin-bottom:0.9rem;">
          <label class="field-label">Password (Scrypt Hashed with Salt)</label>
          <input type="password" id="setupPassword" class="input-control" placeholder="Min 6 characters" required autocomplete="new-password">
        </div>
        <div class="field-group" style="margin-bottom:1.35rem;">
          <label class="field-label">Confirm Password</label>
          <input type="password" id="setupPasswordConfirm" class="input-control" placeholder="Re-enter password" required autocomplete="new-password">
        </div>
        <button type="submit" id="setupSubmitBtn" class="btn btn-primary" style="width:100%; justify-content:center; padding:0.6rem; font-size:0.85rem;">
          Initialize Security & Sign In
        </button>
      </form>
    </div>

    <!-- Standard Login Card -->
    <div id="loginModal" class="onboard-card" style="display:none; max-width:400px;">
      <div style="padding:1.75rem 1.75rem 0.6rem 1.75rem; text-align:center;">
        <div style="width:52px; height:52px; margin:0 auto 0.85rem auto; border-radius:10px; overflow:hidden; border:1px solid var(--border); background:#030712; padding:3px; box-shadow:0 4px 16px rgba(2, 132, 199, 0.35);">
          <img src="${effectiveLogo}" alt="TracerNest-Logger Logo" style="width:100%; height:100%; object-fit:contain;" />
        </div>
        <h3 style="font-size:1.22rem; font-weight:700; color:#fff; letter-spacing:-0.02em; display:flex; align-items:center; justify-content:center; gap:6px;"><span>Sign in to TracerNest</span><span class="brand-pill" style="font-size:0.62rem;">LOGGER</span></h3>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.35rem;">Enter your credentials to access the console</p>
      </div>
      <form id="standardLoginForm" onsubmit="handleLogin(event)" style="padding:1.25rem 1.75rem 1.75rem 1.75rem;">
        <div id="loginErrorMsg" style="display:none; margin-bottom:1rem; padding:0.65rem 0.85rem; border-radius:6px; background:#450a0a; border:1px solid #7f1d1d; color:#fca5a5; font-size:0.8rem; line-height:1.4;"></div>
        <div class="field-group" style="margin-bottom:0.9rem;">
          <label class="field-label">Username</label>
          <input type="text" id="loginUsername" class="input-control" required autocomplete="username" autofocus>
        </div>
        <div class="field-group" style="margin-bottom:1.35rem;">
          <label class="field-label">Password</label>
          <input type="password" id="loginPassword" class="input-control" required autocomplete="current-password">
        </div>
        <button type="submit" id="loginSubmitBtn" class="btn btn-primary" style="width:100%; justify-content:center; padding:0.6rem; font-size:0.85rem;">
          Sign In
        </button>
      </form>
    </div>

    <!-- Temporary Password Reset Required Card -->
    <div id="changePasswordModal" class="onboard-card" style="display:none; max-width:420px;">
      <div style="padding:1.75rem 1.75rem 0.6rem 1.75rem; text-align:center;">
        <div style="width:44px; height:44px; background:linear-gradient(135deg, #d97706, #f59e0b); border-radius:8px; margin:0 auto 0.85rem auto; display:grid; place-items:center; color:#fff; box-shadow:0 4px 14px rgba(217, 119, 6, 0.4);">
          <svg class="icon icon-lg" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="3"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h3 style="font-size:1.25rem; font-weight:700; color:#fff; letter-spacing:-0.02em;">Password Reset Required</h3>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.4rem; line-height:1.5;">
          You signed in with a temporary CLI-generated password. Please configure your new permanent password to access the console.
        </p>
      </div>
      <form id="changePasswordForm" onsubmit="handleChangePassword(event)" style="padding:1.25rem 1.75rem 1.75rem 1.75rem;">
        <div id="changePassErrorMsg" style="display:none; margin-bottom:1rem; padding:0.65rem 0.85rem; border-radius:6px; background:#450a0a; border:1px solid #7f1d1d; color:#fca5a5; font-size:0.8rem; line-height:1.4;"></div>
        <div class="field-group" style="margin-bottom:0.9rem;">
          <label class="field-label">New Password</label>
          <input type="password" id="newAdminPassword" class="input-control" placeholder="Min 6 characters" required autocomplete="new-password">
        </div>
        <div class="field-group" style="margin-bottom:1.35rem;">
          <label class="field-label">Confirm New Password</label>
          <input type="password" id="newAdminPasswordConfirm" class="input-control" placeholder="Re-enter new password" required autocomplete="new-password">
        </div>
        <button type="submit" id="changePassSubmitBtn" class="btn btn-primary" style="width:100%; justify-content:center; padding:0.6rem; font-size:0.85rem;">
          Update Password & Open Console
        </button>
      </form>
    </div>
  </div>

  <!-- Custom Export Dialog Modal (No JS prompt) -->
  <div id="exportModal" class="log-modal-overlay" onclick="handleExportModalBackdropClick(event)">
    <div class="log-modal-container dialog-export">
      <div class="log-modal-header">
        <div style="display:flex; align-items:center; gap:0.65rem;">
          <div style="width:30px; height:30px; border-radius:7px; background:rgba(56, 189, 248, 0.12); border:1px solid rgba(56, 189, 248, 0.25); display:flex; align-items:center; justify-content:center; color:var(--accent-primary);">
            <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div>
            <h3 style="font-size:0.95rem; font-weight:600; color:var(--text-primary); margin:0;">Export Telemetry Logs</h3>
            <p style="font-size:0.73rem; color:var(--text-muted); margin:0.15rem 0 0 0;">Download intercepted application logs and HTTP telemetry records</p>
          </div>
        </div>
        <button class="btn btn-icon-only" onclick="closeExportModal()" title="Close">&times;</button>
      </div>
      <div style="padding: 1.25rem 1.5rem; overflow-y:auto; max-height:calc(85vh - 70px);">
        <!-- Export Scope Selection -->
        <label class="field-label" style="margin-bottom:0.45rem; display:block;">1. Select Export Scope</label>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.65rem; margin-bottom:1.15rem;">
          <div id="exportScopeFiltered" class="export-scope-card active" onclick="setExportScope('filtered')">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem;">
              <span style="font-weight:600; font-size:0.83rem; color:var(--text-primary);">Filtered Logs</span>
              <div class="export-radio-dot"></div>
            </div>
            <span id="exportScopeFilteredCount" style="font-size:0.72rem; color:var(--text-muted); line-height:1.3; display:block;">Matching active query/filters</span>
          </div>

          <div id="exportScopeAll" class="export-scope-card" onclick="setExportScope('all')">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem;">
              <span style="font-weight:600; font-size:0.83rem; color:var(--text-primary);">All Buffer Logs</span>
              <div class="export-radio-dot"></div>
            </div>
            <span id="exportScopeAllCount" style="font-size:0.72rem; color:var(--text-muted); line-height:1.3; display:block;">Entire circular ring buffer</span>
          </div>
        </div>

        <!-- Format Selection -->
        <label class="field-label" style="margin-bottom:0.45rem; display:block;">2. Choose File Format</label>
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:0.65rem; margin-bottom:1.15rem;">
          <!-- JSON -->
          <div id="exportOptJson" class="export-format-card active" onclick="setExportFormat('json')">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem;">
              <span class="brand-pill" style="font-size:0.62rem; font-weight:700; color:var(--accent-primary);">.JSON</span>
              <div class="export-radio-dot"></div>
            </div>
            <div style="font-weight:600; font-size:0.83rem; color:var(--text-primary); margin-bottom:0.2rem;">Structured JSON</div>
            <span style="font-size:0.69rem; color:var(--text-muted); line-height:1.3; display:block;">Full metadata, headers & payloads</span>
          </div>

          <!-- CSV -->
          <div id="exportOptCsv" class="export-format-card" onclick="setExportFormat('csv')">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem;">
              <span class="brand-pill" style="font-size:0.62rem; font-weight:700; color:var(--accent-success);">.CSV</span>
              <div class="export-radio-dot"></div>
            </div>
            <div style="font-weight:600; font-size:0.83rem; color:var(--text-primary); margin-bottom:0.2rem;">Tabular CSV</div>
            <span style="font-size:0.69rem; color:var(--text-muted); line-height:1.3; display:block;">Spreadsheet & reporting compatible</span>
          </div>

          <!-- NDJSON -->
          <div id="exportOptNdjson" class="export-format-card" onclick="setExportFormat('ndjson')">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem;">
              <span class="brand-pill" style="font-size:0.62rem; font-weight:700; color:var(--accent-secondary);">.NDJSON</span>
              <div class="export-radio-dot"></div>
            </div>
            <div style="font-weight:600; font-size:0.83rem; color:var(--text-primary); margin-bottom:0.2rem;">Newline JSON</div>
            <span style="font-size:0.69rem; color:var(--text-muted); line-height:1.3; display:block;">ELK, Datadog & log stream ingestion</span>
          </div>
        </div>

        <!-- Details / Summary Box -->
        <div style="background:var(--bg-base); border:1px solid var(--border-subtle); border-radius:8px; padding:0.85rem 1rem; margin-bottom:1.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.76rem; margin-bottom:0.35rem;">
            <span style="color:var(--text-secondary);">Active Filters:</span>
            <span id="exportActiveFiltersSummary" style="color:var(--text-primary); font-family:var(--font-mono); font-size:0.72rem;">Level: ALL | Source: ALL</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.76rem;">
            <span style="color:var(--text-secondary);">Filename:</span>
            <span id="exportFileNamePreview" style="color:var(--accent-primary); font-family:var(--font-mono); font-size:0.72rem;">tracernest-export.json</span>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:0.65rem;">
          <button class="btn" onclick="closeExportModal()">Cancel</button>
          <button id="btnSubmitExport" class="btn btn-primary" onclick="submitExportDownload()">
            <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span id="btnSubmitExportText">Download Export</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Custom Confirmation Dialog Modal (No JS confirm) -->
  <div id="confirmModal" class="log-modal-overlay" onclick="handleConfirmModalBackdropClick(event)">
    <div class="log-modal-container dialog-sm">
      <div class="log-modal-header" style="border-bottom:none; padding-bottom:0.5rem;">
        <div style="display:flex; align-items:center; gap:0.65rem;">
          <div id="confirmIconWrap" style="width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; background:rgba(239, 68, 68, 0.15); color:var(--accent-error);">
            <svg class="icon" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h3 id="confirmTitle" style="font-size:0.98rem; font-weight:600; color:var(--text-primary);">Confirm Action</h3>
        </div>
        <button class="btn btn-icon-only" onclick="resolveConfirm(false)" title="Close">&times;</button>
      </div>
      <div style="padding: 0.5rem 1.5rem 1.25rem 1.5rem;">
        <p id="confirmMessage" style="font-size:0.83rem; color:var(--text-secondary); line-height:1.5; margin-bottom:1.5rem;">
          Are you sure you want to proceed with this action?
        </p>
        <div style="display:flex; justify-content:flex-end; gap:0.65rem;">
          <button id="confirmCancelBtn" class="btn" onclick="resolveConfirm(false)">Cancel</button>
          <button id="confirmActionBtn" class="btn btn-danger" onclick="resolveConfirm(true)">Confirm</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Custom Server Health & Diagnostics Modal (No JS alert) -->
  <div id="healthModal" class="log-modal-overlay" onclick="handleHealthModalBackdropClick(event)">
    <div class="log-modal-container diag-dialog">
      <div class="log-modal-header">
        <div style="display:flex; align-items:center; gap:0.65rem;">
          <div style="width:28px; height:28px; border-radius:6px; background:rgba(56, 189, 248, 0.12); border:1px solid rgba(56, 189, 248, 0.25); display:flex; align-items:center; justify-content:center; color:var(--accent-primary);">
            <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div>
            <h3 style="font-size:0.95rem; font-weight:600; color:var(--text-primary); line-height:1.2;">Server Health & Telemetry Diagnostic</h3>
            <span style="font-size:0.68rem; color:var(--text-muted); font-family:var(--font-mono);">Live Infrastructure & Telemetry Pulse</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span class="role-tag admin" style="background:rgba(56, 189, 248, 0.1); color:#38bdf8; border-color:rgba(56, 189, 248, 0.3); font-size:0.68rem; padding:2px 7px;">LIVE RUNTIME</span>
          <button class="btn btn-icon-only" onclick="closeHealthModal()" title="Close">&times;</button>
        </div>
      </div>
      <div style="padding: 1.25rem 1.5rem;">
        <!-- Hero Status Banner -->
        <div class="diag-hero-banner">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span id="hmStatusDot" class="health-dot" style="width:12px; height:12px; min-width:12px; border-radius:50%; background:var(--accent-success); box-shadow:0 0 10px rgba(16, 185, 129, 0.65);"></span>
            <div>
              <div id="hmStatusTitle" style="font-weight:600; font-size:0.95rem; color:#34d399; letter-spacing:-0.01em;">System Status: HEALTHY</div>
              <div id="hmStatusSub" style="font-size:0.72rem; color:var(--text-secondary); margin-top:2px;">All telemetry pipelines, SQL encryption stores, and ring buffers operational</div>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
            <span id="hmUptimeBadge" style="font-family:var(--font-mono); font-size:0.74rem; color:var(--text-primary); background:var(--bg-surface); padding:3px 9px; border-radius:5px; border:1px solid var(--border);">Uptime: 0s</span>
            <span id="hmLatencyBadge" style="font-family:var(--font-mono); font-size:0.68rem; color:var(--accent-primary); background:rgba(56, 189, 248, 0.08); padding:2px 6px; border-radius:4px; border:1px solid rgba(56, 189, 248, 0.2);">Latency: 0ms</span>
          </div>
        </div>

        <!-- 6 Diagnostic KPI Cards -->
        <div class="diag-grid">
          <!-- Card 1: Database Health -->
          <div class="diag-card">
            <div class="diag-label">
              <span>Database Engine</span>
              <svg class="icon icon-xs" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            </div>
            <div id="hmDatabaseVal" class="diag-value">SQLITE (CONNECTED)</div>
            <div id="hmDatabaseSub" class="diag-subtext">RBAC Schema: Verified (Users Loaded)</div>
          </div>

          <!-- Card 2: Runtime Process -->
          <div class="diag-card">
            <div class="diag-label">
              <span>Runtime Process</span>
              <svg class="icon icon-xs" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
            </div>
            <div id="hmProcessVal" class="diag-value">PID 0 &bull; Node.js</div>
            <div id="hmProcessSub" class="diag-subtext">Platform: os (x64)</div>
          </div>

          <!-- Card 3: Heap Memory Allocation -->
          <div class="diag-card">
            <div class="diag-label">
              <span>Heap Memory Allocation</span>
              <span id="hmMemoryPct" style="color:var(--accent-primary); font-family:var(--font-mono);">0%</span>
            </div>
            <div id="hmMemoryVal" class="diag-value">0 MB / 0 MB</div>
            <div class="diag-bar-track">
              <div id="hmMemoryBar" class="diag-bar-fill" style="width:0%;"></div>
            </div>
          </div>

          <!-- Card 4: In-Memory Ring Buffer -->
          <div class="diag-card">
            <div class="diag-label">
              <span>In-Memory Log Buffer</span>
              <span id="hmBufferPct" style="color:var(--accent-success); font-family:var(--font-mono);">0%</span>
            </div>
            <div id="hmBufferVal" class="diag-value">0 / 5,000 logs</div>
            <div class="diag-bar-track">
              <div id="hmBufferBar" class="diag-bar-fill" style="width:0%; background:var(--accent-success);"></div>
            </div>
          </div>

          <!-- Card 5: Automated Log Retention (TTL) -->
          <div class="diag-card">
            <div class="diag-label">
              <span>Auto-Retention Sweeper</span>
              <span class="role-tag" style="background:rgba(168, 85, 247, 0.15); color:#c084fc; border-color:rgba(168, 85, 247, 0.3); font-size:0.62rem; padding:1px 5px;">ACTIVE</span>
            </div>
            <div id="hmTtlPurgedVal" class="diag-value" style="color:var(--accent-primary);">0 logs evicted</div>
            <div class="diag-subtext">Sweeps expired logs every 60s</div>
          </div>

          <!-- Card 6: Ingestion Radar -->
          <div class="diag-card">
            <div class="diag-label">
              <span>Ingestion Radar</span>
              <svg class="icon icon-xs" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6a6 6 0 0 0-6 6h6z"/></svg>
            </div>
            <div id="hmThroughputVal" class="diag-value" style="color:#10b981;">0 logs/sec</div>
            <div id="hmTimestampVal" class="diag-subtext">Real-time telemetry stream</div>
          </div>
        </div>

        <!-- Footer / Latency Bar -->
        <div class="diag-footer-bar">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <svg class="icon icon-xs" style="color:var(--accent-success);" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            <span id="hmDiagLatencyText">Diagnostic completed in 0ms &bull; Subsystems verified</span>
          </div>
          <span style="font-family:var(--font-mono); font-size:0.68rem; color:var(--text-dim);">TracerNest-Logger Engine</span>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:0.65rem;">
          <button id="btnModalRerun" class="btn" onclick="runHealthDiagnostic()">
            <svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            <span>Re-run Diagnostic</span>
          </button>
          <button class="btn btn-primary" onclick="closeHealthModal()">Close</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Detailed Log Inspection Popup Window Modal -->
  <div id="logDetailModal" class="log-modal-overlay" onclick="handleLogModalBackdropClick(event)">
    <div class="log-modal-container">
      <div class="log-modal-header">
        <div style="display:flex; align-items:center; gap:0.65rem; flex-wrap:wrap;">
          <span id="lmLevelPill" class="severity-pill pill-info">INFO</span>
          <span id="lmSourcePill" class="source-label">STDOUT</span>
          <h3 style="font-size:0.95rem; font-weight:700; color:#fff; letter-spacing:-0.01em;">Log Entry Inspector</h3>
          <span id="lmIdBadge" style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-secondary); background:var(--bg-base); padding:2px 7px; border-radius:4px; border:1px solid var(--border-strong);"></span>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <button class="btn btn-sm" id="btnModalPrev" onclick="navigateModalLog(-1)" title="Previous Log (Left Arrow)">
            ◀ Prev
          </button>
          <span id="modalLogIndex" style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono); min-width:60px; text-align:center;">1 of 1</span>
          <button class="btn btn-sm" id="btnModalNext" onclick="navigateModalLog(1)" title="Next Log (Right Arrow)">
            Next ▶
          </button>
          <button class="btn btn-icon-only" onclick="closeLogModal()" title="Close (ESC)">
            <svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="log-modal-body">
        <div class="log-meta-bar">
          <div class="meta-item">
            <span class="meta-item-label">TIMESTAMP</span>
            <span id="lmTimestamp" class="meta-item-val">-</span>
          </div>
          <div class="meta-item">
            <span class="meta-item-label">SEVERITY</span>
            <span id="lmLevelText" class="meta-item-val">-</span>
          </div>
          <div class="meta-item">
            <span class="meta-item-label">SOURCE</span>
            <span id="lmSourceText" class="meta-item-val">-</span>
          </div>
          <div id="lmMetaDurationItem" class="meta-item" style="display:none;">
            <span class="meta-item-label">LATENCY</span>
            <span id="lmDurationText" class="meta-item-val">-</span>
          </div>
          <div id="lmMetaStatusItem" class="meta-item" style="display:none;">
            <span class="meta-item-label">STATUS CODE</span>
            <span id="lmStatusText" class="meta-item-val">-</span>
          </div>
          <div id="lmMetaIpItem" class="meta-item" style="display:none;">
            <span class="meta-item-label">CLIENT IP</span>
            <span id="lmIpText" class="meta-item-val" style="color:#38bdf8;">-</span>
          </div>
        </div>

        <div class="log-modal-section">
          <div class="log-modal-section-header">
            <span>COMPLETE LOG MESSAGE</span>
            <button class="btn btn-sm" id="btnCopyMsg" onclick="copyModalMsg()">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy Full Message
            </button>
          </div>
          <pre id="lmFullMessage" class="log-modal-code"></pre>
        </div>

        <div id="lmHttpSection" class="log-modal-section" style="display:none;">
          <div class="log-modal-section-header">
            <span>HTTP REQUEST & RESPONSE PAYLOADS</span>
          </div>
          <div class="http-inspector-grid" style="padding:0;">
            <div class="payload-card">
              <div class="payload-title-bar">
                <span style="display:inline-flex; align-items:center; gap:5px;"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 17V3"/><path d="M6 11l6 6 6-6"/><path d="M19 21H5"/></svg><span>Request Payload (JSON)</span><span id="lmReqEncBadge" class="badge" style="display:none; background:rgba(99,102,241,0.18); color:#a5b4fc; font-size:0.65rem; padding:1px 6px; border-radius:4px; border:1px solid rgba(99,102,241,0.3);">🔒 AES-256-GCM Encrypted</span></span>
                <div style="display:flex; gap:4px;">
                  <button class="btn btn-sm" id="btnDecryptModalReq" style="display:none; color:#818cf8; border-color:rgba(129,140,248,0.3);" onclick="decryptPayloadInModal('req')">🔓 Decrypt</button>
                  <button class="btn btn-sm" id="btnCopyReqPayload" onclick="copyModalReq()">Copy</button>
                </div>
              </div>
              <pre id="lmReqPayload" class="json-code" style="max-height:220px;"></pre>
            </div>
            <div class="payload-card">
              <div class="payload-title-bar">
                <span style="display:inline-flex; align-items:center; gap:5px;"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 3v14"/><path d="M18 9l-6-6-6 6"/><path d="M5 21h14"/></svg><span>Response Payload (JSON)</span><span id="lmResEncBadge" class="badge" style="display:none; background:rgba(99,102,241,0.18); color:#a5b4fc; font-size:0.65rem; padding:1px 6px; border-radius:4px; border:1px solid rgba(99,102,241,0.3);">🔒 AES-256-GCM Encrypted</span></span>
                <div style="display:flex; gap:4px;">
                  <button class="btn btn-sm" id="btnDecryptModalRes" style="display:none; color:#818cf8; border-color:rgba(129,140,248,0.3);" onclick="decryptPayloadInModal('res')">🔓 Decrypt</button>
                  <button class="btn btn-sm" id="btnCopyResPayload" onclick="copyModalRes()">Copy</button>
                </div>
              </div>
              <pre id="lmResPayload" class="json-code" style="max-height:220px;"></pre>
            </div>
          </div>
        </div>

        <div class="log-modal-section">
          <div class="log-modal-section-header">
            <span>RAW LOG RECORD (JSON)</span>
            <button class="btn btn-sm" id="btnCopyRawEntry" onclick="copyModalRaw()">
              <svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy Raw JSON
            </button>
          </div>
          <pre id="lmRawEntry" class="log-modal-code" style="max-height:200px; color:var(--text-secondary);"></pre>
        </div>
      </div>

      <div class="log-modal-footer">
        <span style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">Use ◀ / ▶ arrow keys to step through logs, ESC to close</span>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn" id="btnModalCopyCurl" style="display:none; align-items:center; gap:5px;" onclick="copyModalCurl()"><svg class="icon icon-sm" style="width:12px; height:12px;" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy cURL</span></button>
          <button class="btn btn-primary" onclick="copyModalMsg()">Copy Message</button>
          <button class="btn" onclick="closeLogModal()">Close</button>
        </div>
      </div>
    </div>
  </div>

  <div id="toastBox" class="toast-box">
    <span id="toastMsg">Action completed</span>
  </div>

  <script>
    // Automatically detect the effective base path from the browser URL to seamlessly support
    // Nginx reverse proxies (e.g. location /api/ { proxy_pass http://localhost:3000/; }),
    // API gateways, subpath routing, and direct port access without requiring Nginx configuration changes.
    const BASE_PATH = (function() {
      try {
        let p = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
        while (p.endsWith('/') && p.length > 1) {
          p = p.slice(0, -1);
        }
        const subPages = ['/login', '/setup', '/decryption'];
        for (let i = 0; i < subPages.length; i++) {
          const page = subPages[i];
          if (p.endsWith(page)) {
            return p.slice(0, -page.length) || '/';
          }
        }
        if (p) return p;
      } catch (e) {}
      return "${basePath}";
    })();
    let token = sessionStorage.getItem('logvault_token') || '';
    let currentUser = null;
    let eventSource = null;
    let isPaused = false;
    let autoScroll = true;
    let currentLevel = 'all';
    let currentSource = 'all';
    let currentTimeRange = 'all';
    let currentDensity = 'compact';
    let isRegex = false;
    let logsCache = [];
    let currentModalEntry = null;
    let currentSortOrder = 'desc';
    let currentApiSortOrder = 'desc';
    let totalLogsCount = 0;

    function getAuthHeaders(extraHeaders) {
      const h = Object.assign({}, extraHeaders || {});
      if (token) {
        h['Authorization'] = 'Bearer ' + token;
      }
      return h;
    }

    function showAuthScreen(view) {
      const authScreen = document.getElementById('authScreen');
      const appDashboard = document.getElementById('appDashboard');
      const setupModal = document.getElementById('setupModal');
      const loginModal = document.getElementById('loginModal');
      const changePassModal = document.getElementById('changePasswordModal');

      if (appDashboard) appDashboard.style.display = 'none';
      if (authScreen) authScreen.classList.remove('hidden');

      if (view === 'setup') {
        if (setupModal) setupModal.style.display = 'block';
        if (loginModal) loginModal.style.display = 'none';
        if (changePassModal) changePassModal.style.display = 'none';
      } else if (view === 'change_password') {
        if (setupModal) setupModal.style.display = 'none';
        if (loginModal) loginModal.style.display = 'none';
        if (changePassModal) changePassModal.style.display = 'block';
      } else {
        if (setupModal) setupModal.style.display = 'none';
        if (loginModal) loginModal.style.display = 'block';
        if (changePassModal) changePassModal.style.display = 'none';
      }
    }

    function showDashboard() {
      const authScreen = document.getElementById('authScreen');
      const appDashboard = document.getElementById('appDashboard');
      if (authScreen) authScreen.classList.add('hidden');
      if (appDashboard) appDashboard.style.display = 'flex';
    }

    async function init() {
      try {
        const statusRes = await fetch(\`\${BASE_PATH}/api/auth/status\`);
        if (!statusRes.ok) {
          throw new Error('Status endpoint returned HTTP ' + statusRes.status);
        }
        const status = await statusRes.json();

        if (!status.initialized) {
          if (status.setupDisabled) {
            showToast('Web administrator setup is disabled. Please configure initialAdmin or run npx tracernest-reset-admin.', 'error');
            showAuthScreen('login');
            return;
          }
          showAuthScreen('setup');
          return;
        }

        if (!token) {
          showAuthScreen('login');
          return;
        }

        const authenticated = await fetchCurrentUser();
        if (!authenticated) {
          showAuthScreen('login');
          return;
        }

        if (currentUser && currentUser.mustChangePassword) {
          showAuthScreen('change_password');
          return;
        }

        showDashboard();
        applyRBAC();
        await loadInitialLogs();
        startSSEStream();
        startStatsPolling();
        loadAlertConfigs();
      } catch (err) {
        console.error('TracerNest-Logger init error:', err);
        showAuthScreen('login');
        const errEl = document.getElementById('loginErrorMsg');
        if (errEl) {
          errEl.textContent = 'Connection notice: ' + (err.message || 'Could not verify server status');
          errEl.style.display = 'block';
        }
      }
    }

    async function fetchCurrentUser() {
      try {
        const res = await fetch(\`\${BASE_PATH}/api/auth/me\`, {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        if (!res.ok) return false;
        const data = await res.json();
        currentUser = data.user;
        updateUserHeader();
        return true;
      } catch {
        return false;
      }
    }

    function updateUserHeader() {
      if (!currentUser) return;
      document.getElementById('sideUsername').textContent = currentUser.username;
      const b = document.getElementById('sideRoleBadge');
      b.textContent = currentUser.role;
      b.className = 'role-tag ' + currentUser.role;
    }

    function applyRBAC() {
      if (!currentUser) return;
      const perms = currentUser.permissions || [];

      document.getElementById('navUsers').style.display = perms.includes('users:manage') ? 'flex' : 'none';
      if (document.getElementById('navExclusions')) {
        document.getElementById('navExclusions').style.display = (perms.includes('logs:read') || perms.includes('users:manage')) ? 'flex' : 'none';
      }
      document.getElementById('navAlerts').style.display = perms.includes('alerts:manage') ? 'flex' : 'none';
      document.getElementById('navTtl').style.display = perms.includes('ttl:manage') || perms.includes('logs:read') ? 'flex' : 'none';
      document.getElementById('navAudit').style.display = perms.includes('audit:read') ? 'flex' : 'none';
      document.getElementById('btnClear').style.display = perms.includes('logs:clear') ? 'inline-flex' : 'none';
      document.getElementById('btnExport').style.display = perms.includes('logs:export') ? 'inline-flex' : 'none';
    }

    function switchView(viewName) {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelector(\`.nav-item[data-view="\${viewName}"]\`)?.classList.add('active');

      document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
      const activePanel = document.getElementById('view' + viewName.charAt(0).toUpperCase() + viewName.slice(1));
      if (activePanel) activePanel.classList.add('active');

      const titles = {
        logs: 'Terminal & HTTP Logs Stream',
        apis: 'API Requests & Responses (HTTP Explorer)',
        exclusions: 'Excluded Sensitive APIs (Skip Tracking & Recording)',
        users: 'RBAC User Management (SQL Encrypted)',
        alerts: 'Alert Integrations (Teams & Email)',
        ttl: 'Time-To-Live (TTL) Log Retention & Auto-Purge',
        audit: 'Security Audit Log Trail',
        metrics: 'System Health & Metrics'
      };
      document.getElementById('currentViewTitle').textContent = titles[viewName] || 'Dashboard';
      document.getElementById('topbarActions').style.display = (viewName === 'logs' || viewName === 'apis') ? 'flex' : 'none';

      if (viewName === 'apis') renderApiList();
      if (viewName === 'exclusions') loadExcludedRoutes();
      if (viewName === 'users') loadUsers();
      if (viewName === 'audit') loadAuditLogs();
      if (viewName === 'alerts') loadAlertConfigs();
      if (viewName === 'ttl') loadTTLConfig();
    }

    // SSE Log Streaming (SEC-01: Uses short-lived single-use ticket or HttpOnly cookie, never long-lived bearer tokens in URL)
    async function startSSEStream() {
      if (eventSource) eventSource.close();

      const syncBadge = document.getElementById('syncBadge');
      const syncText = document.getElementById('syncText');
      if (syncBadge) syncBadge.className = 'sync-indicator connecting';
      if (syncText) syncText.textContent = 'Connecting...';

      let streamUrl = \`\${BASE_PATH}/api/logs/stream\`;
      try {
        const ticketRes = await fetch(\`\${BASE_PATH}/api/logs/stream/ticket\`, {
          method: 'POST',
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        if (ticketRes.ok) {
          const ticketData = await ticketRes.json();
          if (ticketData?.ticket) {
            streamUrl += \`?ticket=\${encodeURIComponent(ticketData.ticket)}\`;
          }
        }
      } catch {}

      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('ready', () => {
        if (syncBadge) syncBadge.className = 'sync-indicator synced';
        if (syncText) syncText.textContent = 'Live Sync';
      });

      eventSource.addEventListener('log', (e) => {
        if (isPaused) return;
        try {
          const entry = JSON.parse(e.data);
          appendLog(entry);
        } catch {}
      });

      eventSource.onerror = () => {
        if (syncBadge) syncBadge.className = 'sync-indicator disconnected';
        if (syncText) syncText.textContent = 'Disconnected';
      };
    }

    function escapeRegex(str) {
      var specials = '-[]/{}()*+?.\\^$|';
      return str.split('').map(function(c) {
        return specials.indexOf(c) !== -1 ? String.fromCharCode(92) + c : c;
      }).join('');
    }

    function highlightSearch(text, queryStr) {
      const q = (queryStr !== undefined ? queryStr : (document.getElementById('searchInput')?.value || '')).trim();
      if (!q || !text) return escapeHtml(text || '');
      const escapedText = escapeHtml(text || '');
      try {
        const pattern = isRegex ? q : escapeRegex(q);
        const regex = new RegExp('(' + pattern + ')', 'gi');
        return escapedText.replace(regex, '<mark class="search-match">$1</mark>');
      } catch {
        return escapedText;
      }
    }

    function clearSearchInput() {
      const input = document.getElementById('searchInput');
      if (input) input.value = '';
      const clearBtn = document.getElementById('searchClearBtn');
      if (clearBtn) clearBtn.style.display = 'none';
      loadInitialLogs();
    }

    function clearApiSearchInput() {
      const input = document.getElementById('apiSearchInput');
      if (input) input.value = '';
      const clearBtn = document.getElementById('apiSearchClearBtn');
      if (clearBtn) clearBtn.style.display = 'none';
      renderApiList();
    }

    function handleTimeRangeFilter() {
      currentTimeRange = document.getElementById('timeRangeFilter')?.value || 'all';
      loadInitialLogs();
    }

    function handleSourceFilter() {
      currentSource = document.getElementById('sourceFilter')?.value || 'all';
      loadInitialLogs();
    }

    function toggleDisplayDensity() {
      currentDensity = (currentDensity === 'compact') ? 'comfortable' : 'compact';
      const stream = document.getElementById('logStream');
      const text = document.getElementById('densityText');
      if (stream) {
        stream.classList.toggle('density-comfortable', currentDensity === 'comfortable');
      }
      if (text) {
        text.textContent = currentDensity === 'compact' ? 'Compact' : 'Comfortable';
      }
    }

    function updateFilterCounts(counts) {
      if (!counts) return;
      const setC = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined ? val : 0;
      };
      setC('countAll', counts.all);
      setC('countHttp', counts.http);
      setC('countError', counts.error);
      setC('countWarn', counts.warn);
      setC('countInfo', counts.info);
      setC('countDebug', counts.debug);
    }

    function updateActiveFilterBar(matchingCount, totalOverride) {
      const matchEl = document.getElementById('matchingCount');
      const totalEl = document.getElementById('totalBufferCount');
      if (matchEl) matchEl.textContent = matchingCount;
      if (totalEl) totalEl.textContent = totalOverride !== undefined ? totalOverride : (totalLogsCount || matchingCount);

      const chipsContainer = document.getElementById('activeFilterChips');
      const clearBtn = document.getElementById('clearFiltersBtn');
      if (!chipsContainer) return;
      chipsContainer.innerHTML = '';

      let hasFilters = false;
      const s = document.getElementById('searchInput')?.value.trim();
      if (s) {
        hasFilters = true;
        chipsContainer.appendChild(createFilterChip('Search: "' + s + '"', () => clearSearchInput()));
      }
      if (currentLevel !== 'all') {
        hasFilters = true;
        chipsContainer.appendChild(createFilterChip('Level: ' + currentLevel.toUpperCase(), () => setLevelFilter('all')));
      }
      if (currentTimeRange !== 'all') {
        hasFilters = true;
        chipsContainer.appendChild(createFilterChip('Time: ' + currentTimeRange, () => {
          document.getElementById('timeRangeFilter').value = 'all';
          handleTimeRangeFilter();
        }));
      }
      if (currentSource !== 'all') {
        hasFilters = true;
        chipsContainer.appendChild(createFilterChip('Source: ' + currentSource, () => {
          document.getElementById('sourceFilter').value = 'all';
          handleSourceFilter();
        }));
      }

      if (clearBtn) clearBtn.style.display = hasFilters ? 'inline' : 'none';
    }

    function createFilterChip(label, onRemove) {
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.innerHTML = escapeHtml(label) + ' <span class="chip-close">&times;</span>';
      chip.onclick = onRemove;
      return chip;
    }

    function clearAllFilters() {
      const s = document.getElementById('searchInput');
      if (s) s.value = '';
      const sc = document.getElementById('searchClearBtn');
      if (sc) sc.style.display = 'none';
      if (document.getElementById('timeRangeFilter')) document.getElementById('timeRangeFilter').value = 'all';
      if (document.getElementById('sourceFilter')) document.getElementById('sourceFilter').value = 'all';
      currentTimeRange = 'all';
      currentSource = 'all';
      setLevelFilter('all');
    }

    async function loadInitialLogs() {
      try {
        const query = buildQueryString();
        const res = await fetch(BASE_PATH + '/api/logs' + query, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const data = await res.json();
          logsCache = data.logs || [];
          totalLogsCount = data.total || logsCache.length;
          if (data.counts) {
            updateFilterCounts(data.counts);
          }
          renderLogs(data.total);
        }
      } catch (err) {
        console.error('Failed to load logs:', err);
      }
    }

    function buildQueryString() {
      const p = new URLSearchParams();
      if (currentLevel === 'http') {
        p.append('source', 'http');
      } else if (currentLevel !== 'all') {
        p.append('level', currentLevel);
      }
      if (currentSource !== 'all') {
        p.append('source', currentSource);
      }
      if (currentTimeRange !== 'all') {
        const now = Date.now();
        let fromTime = 0;
        if (currentTimeRange === '15m') fromTime = now - 15 * 60 * 1000;
        else if (currentTimeRange === '1h') fromTime = now - 60 * 60 * 1000;
        else if (currentTimeRange === '6h') fromTime = now - 6 * 60 * 60 * 1000;
        else if (currentTimeRange === '24h') fromTime = now - 24 * 60 * 60 * 1000;
        if (fromTime > 0) p.append('from', String(fromTime));
      }
      const search = document.getElementById('searchInput')?.value.trim();
      if (search) {
        p.append('search', search);
        if (isRegex) p.append('isRegex', 'true');
      }
      p.append('order', currentSortOrder);
      p.append('limit', '500');
      return p.toString() ? '?' + p.toString() : '';
    }

    function toggleSortOrder() {
      currentSortOrder = (currentSortOrder === 'desc') ? 'asc' : 'desc';
      const text = document.getElementById('sortOrderText');
      if (text) {
        text.textContent = currentSortOrder === 'desc' ? 'Time: Newest First ▾' : 'Time: Oldest First ▴';
      }
      renderLogs();
    }

    function appendLog(entry) {
      if (currentLevel === 'http' && entry.source !== 'http' && !entry.metadata?.http) return;
      if (currentLevel !== 'all' && currentLevel !== 'http' && entry.level !== currentLevel) return;
      if (currentSource !== 'all' && entry.source !== currentSource) return;

      const s = document.getElementById('searchInput')?.value.trim();
      if (s) {
        const ipStr = entry.metadata?.http?.clientIp || entry.metadata?.clientIp || entry.metadata?.ip || '';
        if (isRegex) {
          try {
            const re = new RegExp(s, 'i');
            const matchMsg = re.test(entry.message);
            const matchUrl = entry.metadata?.http?.url ? re.test(entry.metadata.http.url) : false;
            const matchIp = ipStr ? re.test(ipStr) : false;
            if (!matchMsg && !matchUrl && !matchIp) return;
          } catch { return; }
        } else {
          const sLower = s.toLowerCase();
          const matchMsg = entry.message.toLowerCase().includes(sLower);
          const matchUrl = entry.metadata?.http?.url ? entry.metadata.http.url.toLowerCase().includes(sLower) : false;
          const matchIp = ipStr.toLowerCase().includes(sLower);
          if (!matchMsg && !matchUrl && !matchIp) return;
        }
      }

      const list = document.getElementById('logList');
      if (currentSortOrder === 'desc') {
        logsCache.unshift(entry);
        if (logsCache.length > 2500) logsCache.pop();
        if (list) list.prepend(createLogLine(entry));
        if (autoScroll) {
          const stream = document.getElementById('logStream');
          if (stream) stream.scrollTop = 0;
        }
      } else {
        logsCache.push(entry);
        if (logsCache.length > 2500) logsCache.shift();
        if (list) list.appendChild(createLogLine(entry));
        if (autoScroll) {
          const stream = document.getElementById('logStream');
          if (stream) stream.scrollTop = stream.scrollHeight;
        }
      }

      totalLogsCount++;
      updateActiveFilterBar(logsCache.length);

      // If user is currently looking at API Explorer view, live update cards
      if (document.getElementById('viewApis')?.classList.contains('active')) {
        renderApiList();
      }
    }

    function getOrderedLogs() {
      const ordered = [...logsCache];
      if (currentSortOrder === 'desc') {
        ordered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      } else {
        ordered.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      }
      return ordered;
    }

    function renderLogs(totalOverride) {
      const list = document.getElementById('logList');
      if (!list) return;
      list.innerHTML = '';
      const ordered = getOrderedLogs();

      updateActiveFilterBar(ordered.length, totalOverride);

      if (ordered.length === 0) {
        list.innerHTML = 
          '<div class="empty-logs-box">' +
            '<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/></svg>' +
            '<div class="empty-logs-title">No matching log entries found</div>' +
            '<div class="empty-logs-desc">No logs matched your active search query or filter criteria.</div>' +
            '<button class="btn btn-primary" onclick="clearAllFilters()">Reset All Filters</button>' +
          '</div>';
        return;
      }

      for (const e of ordered) {
        list.appendChild(createLogLine(e));
      }
      if (autoScroll) {
        const stream = document.getElementById('logStream');
        if (stream) {
          stream.scrollTop = (currentSortOrder === 'desc') ? 0 : stream.scrollHeight;
        }
      }
    }

    function createLogLine(entry) {
      const wrap = document.createElement('div');
      wrap.id = 'wrap_' + entry.id;

      const isHttp = entry.source === 'http' || Boolean(entry.metadata?.http);
      const http = entry.metadata?.http;

      const line = document.createElement('div');
      line.className = 'log-line level-' + entry.level + (isHttp ? ' source-http' : '');
      line.onclick = () => openLogModal(entry.id);

      const arrow = document.createElement('span');
      arrow.className = 'log-toggle-arrow';
      arrow.id = 'arrow_' + entry.id;
      arrow.textContent = '▶';
      arrow.title = 'Toggle Inline Drawer';
      arrow.onclick = (e) => {
        e.stopPropagation();
        toggleLogDetails(entry.id);
      };

      const time = document.createElement('span');
      time.className = 'log-timestamp';
      const d = new Date(entry.timestamp);
      time.textContent = d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
      time.title = d.toISOString();

      const pill = document.createElement('span');
      pill.className = 'severity-pill pill-' + entry.level;
      pill.textContent = entry.level.toUpperCase();

      const src = document.createElement('span');
      src.className = 'source-label ' + (isHttp ? 'http' : '');
      src.textContent = isHttp ? 'HTTP' : (entry.source || 'stdout');

      const msg = document.createElement('div');
      msg.className = 'log-content';

      const clientIp = http?.clientIp || entry.metadata?.clientIp || entry.metadata?.ip || '';

      if (isHttp) {
        const method = http?.method || 'GET';
        const statusCode = http?.statusCode || 200;
        const statusClass = statusCode >= 500 ? 'status-5xx' : (statusCode >= 400 ? 'status-4xx' : 'status-2xx');
        const urlStr = http?.url || entry.message || '';
        const displayUrl = urlStr.length > 75 ? urlStr.slice(0, 75) + '...' : urlStr;
        const durationStr = http?.durationMs !== undefined ? http.durationMs + 'ms' : '';

        let httpHtml = '<div style="display:flex; align-items:center; gap:0.55rem; min-width:0; overflow:hidden; flex:1;">' +
          '<span class="method-badge method-' + method + '">' + method + '</span>' +
          '<span class="status-badge ' + statusClass + '">' + statusCode + '</span>' +
          '<span class="log-content-text" style="font-family:var(--font-mono); color:#fff; font-weight:600;" title="' + escapeHtml(urlStr) + '">' + highlightSearch(displayUrl) + '</span>';
        if (durationStr) {
          httpHtml += '<span style="color:#94a3b8; font-size:0.75rem; white-space:nowrap;">' + durationStr + '</span>';
        }
        httpHtml += '</div>';
        msg.innerHTML = httpHtml;
      } else {
        const rawMsg = entry.message || '';
        const limit = 120;
        const isTruncated = rawMsg.length > limit;
        const displayMsg = isTruncated ? rawMsg.slice(0, limit) + '...' : rawMsg;

        const txtSpan = document.createElement('span');
        txtSpan.className = 'log-content-text';
        txtSpan.innerHTML = highlightSearch(displayMsg);
        txtSpan.title = rawMsg;
        msg.appendChild(txtSpan);
      }

      // Column 6: Client IP
      const ipCol = document.createElement('span');
      ipCol.style.cssText = 'font-size:0.72rem; font-family:var(--font-mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
      if (clientIp) {
        ipCol.innerHTML = highlightSearch(clientIp);
        ipCol.style.color = '#38bdf8';
        ipCol.title = 'Client IP: ' + clientIp;
      } else {
        ipCol.textContent = '-';
        ipCol.style.color = '#475569';
      }

      // Column 7: Action (Full Log)
      const actCol = document.createElement('div');
      actCol.style.cssText = 'text-align:right;';
      const openPill = document.createElement('span');
      openPill.className = 'log-open-pill';
      openPill.innerHTML = '<svg class="icon icon-sm" style="width:11px; height:11px; flex-shrink:0;" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/></svg><span>Full Log</span>';
      openPill.onclick = (e) => {
        e.stopPropagation();
        openLogModal(entry.id);
      };
      actCol.appendChild(openPill);

      line.appendChild(arrow);
      line.appendChild(time);
      line.appendChild(pill);
      line.appendChild(src);
      line.appendChild(msg);
      line.appendChild(ipCol);
      line.appendChild(actCol);

      wrap.appendChild(line);

      const drawer = document.createElement('div');
      drawer.id = 'drawer_' + entry.id;
      drawer.className = 'log-drawer';
      drawer.style.display = 'none';
      wrap.appendChild(drawer);

      return wrap;
    }

    function openLogModal(id) {
      const ordered = getOrderedLogs();
      const idx = ordered.findIndex(e => e.id === id);
      if (idx === -1) return;
      const entry = ordered[idx];
      currentModalEntry = entry;

      const modal = document.getElementById('logDetailModal');
      if (!modal) return;

      // Update Prev / Next buttons and counter
      const prevBtn = document.getElementById('btnModalPrev');
      const nextBtn = document.getElementById('btnModalNext');
      const idxSpan = document.getElementById('modalLogIndex');
      if (prevBtn) prevBtn.disabled = idx <= 0;
      if (nextBtn) nextBtn.disabled = idx >= ordered.length - 1;
      if (idxSpan) idxSpan.textContent = (idx + 1) + ' of ' + ordered.length;

      const pill = document.getElementById('lmLevelPill');
      pill.textContent = entry.level.toUpperCase();
      pill.className = 'severity-pill pill-' + entry.level;

      const srcPill = document.getElementById('lmSourcePill');
      srcPill.textContent = (entry.source || 'stdout').toUpperCase();
      srcPill.className = 'source-label ' + (entry.source === 'http' ? 'http' : '');

      document.getElementById('lmIdBadge').textContent = 'ID: ' + entry.id;

      const d = new Date(entry.timestamp);
      document.getElementById('lmTimestamp').textContent = d.toISOString() + ' (' + d.toLocaleTimeString() + ')';
      document.getElementById('lmLevelText').textContent = entry.level.toUpperCase();
      document.getElementById('lmSourceText').textContent = entry.source || 'stdout';

      const http = entry.metadata?.http;
      const durItem = document.getElementById('lmMetaDurationItem');
      const statusItem = document.getElementById('lmMetaStatusItem');
      const httpSec = document.getElementById('lmHttpSection');
      const curlBtn = document.getElementById('btnModalCopyCurl');

      if (http) {
        if (curlBtn) curlBtn.style.display = 'inline-flex';
        durItem.style.display = 'flex';
        document.getElementById('lmDurationText').textContent = (http.durationMs !== undefined ? http.durationMs + 'ms' : '-');

        statusItem.style.display = 'flex';
        document.getElementById('lmStatusText').textContent = http.statusCode || '-';

        httpSec.style.display = 'flex';
        const reqEl = document.getElementById('lmReqPayload');
        const resEl = document.getElementById('lmResPayload');
        const reqEncBadge = document.getElementById('lmReqEncBadge');
        const resEncBadge = document.getElementById('lmResEncBadge');
        const btnDecReq = document.getElementById('btnDecryptModalReq');
        const btnDecRes = document.getElementById('btnDecryptModalRes');

        const isReqEnc = http.requestBody && (http.requestBody.encrypted || http.requestBody.__encrypted);
        const isResEnc = http.responseBody && (http.responseBody.encrypted || http.responseBody.__encrypted);

        if (reqEncBadge) reqEncBadge.style.display = isReqEnc ? 'inline-flex' : 'none';
        if (resEncBadge) resEncBadge.style.display = isResEnc ? 'inline-flex' : 'none';
        if (btnDecReq) {
          btnDecReq.style.display = isReqEnc ? 'inline-flex' : 'none';
          btnDecReq.textContent = '🔓 Decrypt';
          btnDecReq.disabled = false;
          btnDecReq.style.color = '#818cf8';
        }
        if (btnDecRes) {
          btnDecRes.style.display = isResEnc ? 'inline-flex' : 'none';
          btnDecRes.textContent = '🔓 Decrypt';
          btnDecRes.disabled = false;
          btnDecRes.style.color = '#818cf8';
        }

        reqEl.textContent = http.requestBody !== undefined ? JSON.stringify(http.requestBody, null, 2) : '(No Request Body)';
        resEl.textContent = http.responseBody !== undefined ? JSON.stringify(http.responseBody, null, 2) : '(No Response Body)';
      } else {
        if (curlBtn) curlBtn.style.display = 'none';
        durItem.style.display = 'none';
        statusItem.style.display = 'none';
        httpSec.style.display = 'none';
      }

      const ipItem = document.getElementById('lmMetaIpItem');
      const clientIp = http?.clientIp || entry.metadata?.ip || entry.metadata?.clientIp;
      if (clientIp) {
        if (ipItem) ipItem.style.display = 'flex';
        const ipEl = document.getElementById('lmIpText');
        if (ipEl) ipEl.textContent = clientIp;
      } else if (ipItem) {
        ipItem.style.display = 'none';
      }

      const msgEl = document.getElementById('lmFullMessage');
      msgEl.textContent = entry.message || '(Empty message)';

      const rawEl = document.getElementById('lmRawEntry');
      rawEl.textContent = JSON.stringify(entry, null, 2);

      modal.classList.add('active');
    }

    function navigateModalLog(direction) {
      if (!currentModalEntry) return;
      const ordered = getOrderedLogs();
      const idx = ordered.findIndex(e => e.id === currentModalEntry.id);
      const nextIdx = idx + direction;
      if (nextIdx >= 0 && nextIdx < ordered.length) {
        openLogModal(ordered[nextIdx].id);
      }
    }

    function copyModalCurl() {
      if (!currentModalEntry?.metadata?.http) return;
      const h = currentModalEntry.metadata.http;
      let cmd = 'curl -X ' + (h.method || 'GET') + ' "' + location.origin + (h.url || '/') + '"';
      if (h.requestBody) {
        cmd += ' -H "Content-Type: application/json" -d ' + String.fromCharCode(39) + JSON.stringify(h.requestBody) + String.fromCharCode(39);
      }
      navigator.clipboard.writeText(cmd);
      showToast('cURL command copied to clipboard');
    }

    function closeLogModal() {
      const modal = document.getElementById('logDetailModal');
      if (modal) modal.classList.remove('active');
      currentModalEntry = null;
    }

    function handleLogModalBackdropClick(event) {
      if (event.target === document.getElementById('logDetailModal')) {
        closeLogModal();
      }
    }

    document.addEventListener('keydown', (e) => {
      // Focus search bar on '/' or 'Ctrl+K'
      if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        const searchInput = document.getElementById('viewApis')?.classList.contains('active') 
          ? document.getElementById('apiSearchInput') 
          : document.getElementById('searchInput');
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Modal dismissal with Escape key
      if (e.key === 'Escape') {
        closeLogModal();
        closeExportModal();
        resolveConfirm(false);
        closeHealthModal();
        return;
      }

      // If log detail modal is open, navigate with Left/Right arrows
      const modal = document.getElementById('logDetailModal');
      if (modal?.classList.contains('active')) {
        if (e.key === 'ArrowLeft') {
          navigateModalLog(-1);
        } else if (e.key === 'ArrowRight') {
          navigateModalLog(1);
        }
      }
    });

    function copyModalMsg() {
      if (!currentModalEntry) return;
      navigator.clipboard.writeText(currentModalEntry.message || '');
      showToast('Log message copied to clipboard');
    }

    function copyModalReq() {
      if (!currentModalEntry?.metadata?.http?.requestBody) return;
      navigator.clipboard.writeText(JSON.stringify(currentModalEntry.metadata.http.requestBody, null, 2));
      showToast('Request JSON copied');
    }

    function copyModalRes() {
      if (!currentModalEntry?.metadata?.http?.responseBody) return;
      navigator.clipboard.writeText(JSON.stringify(currentModalEntry.metadata.http.responseBody, null, 2));
      showToast('Response JSON copied');
    }

    function copyModalRaw() {
      if (!currentModalEntry) return;
      navigator.clipboard.writeText(JSON.stringify(currentModalEntry, null, 2));
      showToast('Raw log JSON copied');
    }

    async function decryptPayloadInModal(type) {
      if (!currentModalEntry?.metadata?.http) return;
      const http = currentModalEntry.metadata.http;
      const targetPayload = type === 'req' ? http.requestBody : http.responseBody;
      if (!targetPayload) return;

      const el = type === 'req' ? document.getElementById('lmReqPayload') : document.getElementById('lmResPayload');
      const btn = type === 'req' ? document.getElementById('btnDecryptModalReq') : document.getElementById('btnDecryptModalRes');
      if (btn) btn.textContent = 'Decrypting...';

      try {
        const res = await fetch(BASE_PATH + '/api/logs/decrypt', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ payload: targetPayload })
        });
        const data = await res.json();
        if (data.success) {
          if (type === 'req') http.requestBody = data.decrypted;
          else http.responseBody = data.decrypted;
          if (el) el.textContent = typeof data.decrypted === 'string' ? data.decrypted : JSON.stringify(data.decrypted, null, 2);
          if (btn) {
            btn.textContent = '🔓 Decrypted';
            btn.style.color = '#34d399';
            btn.disabled = true;
          }
          showToast('Payload decrypted successfully');
        } else {
          showToast(data.error || 'Decryption failed', true);
          if (btn) btn.textContent = '🔓 Decrypt';
        }
      } catch (err) {
        showToast('Decryption error: ' + err.message, true);
        if (btn) btn.textContent = '🔓 Decrypt';
      }
    }

    async function decryptPayloadInCard(logId, type, btnEl) {
      const log = allLogs.find(l => l.id === logId);
      if (!log?.metadata?.http) return;
      const http = log.metadata.http;
      const targetPayload = type === 'req' ? http.requestBody : http.responseBody;
      if (!targetPayload) return;

      const preEl = document.getElementById(logId + '_card_' + type);
      if (btnEl) btnEl.textContent = '...';

      try {
        const res = await fetch(BASE_PATH + '/api/logs/decrypt', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ payload: targetPayload })
        });
        const data = await res.json();
        if (data.success) {
          if (type === 'req') http.requestBody = data.decrypted;
          else http.responseBody = data.decrypted;
          if (preEl) preEl.textContent = typeof data.decrypted === 'string' ? data.decrypted : JSON.stringify(data.decrypted, null, 2);
          if (btnEl) {
            btnEl.textContent = '🔓 Decrypted';
            btnEl.style.color = '#34d399';
            btnEl.disabled = true;
          }
          showToast('Payload decrypted');
        } else {
          showToast(data.error || 'Decryption failed', true);
          if (btnEl) btnEl.textContent = 'Decrypt';
        }
      } catch (err) {
        showToast('Decryption error: ' + err.message, true);
        if (btnEl) btnEl.textContent = 'Decrypt';
      }
    }

    function toggleLogDetails(id) {
      const drawer = document.getElementById('drawer_' + id);
      const arrow = document.getElementById('arrow_' + id);
      if (!drawer) return;
      const isOpen = drawer.style.display === 'block';
      drawer.style.display = isOpen ? 'none' : 'block';
      if (arrow) arrow.className = isOpen ? 'log-toggle-arrow' : 'log-toggle-arrow open';

      if (!isOpen && !drawer.hasChildNodes()) {
        const entry = logsCache.find(e => e.id === id);
        if (entry) {
          renderLogDrawer(drawer, entry);
        }
      }
    }

    function renderLogDrawer(drawer, entry) {
      const http = entry.metadata?.http;

      if (http) {
        // HTTP Request & Response Inspector
        const statusClass = http.statusCode >= 500 ? 'status-5xx' : http.statusCode >= 400 ? 'status-4xx' : 'status-2xx';
        const methodClass = 'method-' + http.method;

        const reqBodyStr = http.requestBody !== undefined ? escapeHtml(JSON.stringify(http.requestBody, null, 2)) : '<span style="color:#64748b;">(No Request Body)</span>';
        const resBodyStr = http.responseBody !== undefined ? escapeHtml(JSON.stringify(http.responseBody, null, 2)) : '<span style="color:#64748b;">(No Response Body)</span>';

        drawer.innerHTML = 
          '<div class="http-inspector">' +
            '<div class="http-inspector-header">' +
              '<span class="method-badge ' + methodClass + '">' + http.method + '</span>' +
              '<span class="status-badge ' + statusClass + '">' + http.statusCode + '</span>' +
              '<span style="font-weight:600; color:#fff; font-family:var(--font-mono); font-size:0.8rem;">' + escapeHtml(http.url) + '</span>' +
              '<span style="margin-left:auto; color:#94a3b8; font-size:0.75rem;">' + (http.durationMs || 0) + 'ms</span>' +
              '<span style="color:#64748b; font-size:0.72rem;">' + (http.clientIp || '') + '</span>' +
            '</div>' +
            '<div class="http-inspector-grid">' +
              '<div class="payload-card">' +
                '<div class="payload-title-bar">' +
                  '<span>Request Payload (Received)</span>' +
                  '<button class="btn" style="padding:1px 5px; font-size:0.68rem;" onclick="copyPayload(this.dataset.target)" data-target="' + entry.id + '_req">Copy</button>' +
                '</div>' +
                '<pre id="' + entry.id + '_req" class="json-code">' + reqBodyStr + '</pre>' +
              '</div>' +
              '<div class="payload-card">' +
                '<div class="payload-title-bar">' +
                  '<span>Response Payload (Returned)</span>' +
                  '<button class="btn" style="padding:1px 5px; font-size:0.68rem;" onclick="copyPayload(this.dataset.target)" data-target="' + entry.id + '_res">Copy</button>' +
                '</div>' +
                '<pre id="' + entry.id + '_res" class="json-code">' + resBodyStr + '</pre>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex; justify-content:flex-end; gap:0.5rem; padding:0.45rem 0.85rem; background:#050914; border-top:1px solid var(--border-subtle);">' +
              '<button class="btn btn-sm" style="color:#f87171; border-color:rgba(239,68,68,0.3);" onclick="promptQuickExcludeRoute(this.dataset.url, this.dataset.method)" data-url="' + escapeHtml(http.url || '') + '" data-method="' + (http.method || 'ALL') + '"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><span>Skip Route</span></button>' +
              '<button class="btn btn-sm" onclick="copyApiCurl(this.dataset.id)" data-id="' + entry.id + '"><svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy cURL</span></button>' +
              '<button class="btn btn-sm" onclick="openLogModal(this.dataset.id)" data-id="' + entry.id + '"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/></svg><span>Open in Full Inspector</span></button>' +
            '</div>' +
          '</div>';
      } else {
        // Standard Log Metadata View
        let drawerContent = '<div style="display:flex; gap:1.5rem; margin-bottom:0.4rem; color:#94a3b8; font-size:0.72rem;">' +
          '<span>ID: ' + entry.id + '</span>' +
          '<span>ISO: ' + new Date(entry.timestamp).toISOString() + '</span>' +
          '<span>SOURCE: ' + entry.source + '</span>';
        if (entry.expiresAt) {
          drawerContent += '<span style="color:#a855f7;">EXPIRES: ' + new Date(entry.expiresAt).toLocaleTimeString() + '</span>';
        }
        drawerContent += '</div>';
        if (entry.metadata) {
          drawerContent += '<pre style="background:#040711; padding:0.5rem; border-radius:4px; color:#38bdf8;">' + escapeHtml(JSON.stringify(entry.metadata, null, 2)) + '</pre>';
        }
        drawer.innerHTML = drawerContent;
      }
    }

    function copyPayload(elementId) {
      const el = document.getElementById(elementId);
      if (el) {
        navigator.clipboard.writeText(el.textContent);
        showToast('JSON copied to clipboard');
      }
    }

    let currentApiMethodFilter = 'all';

    function setApiMethodFilter(method) {
      currentApiMethodFilter = method;
      document.querySelectorAll('[data-api-method]').forEach(b => {
        b.classList.toggle('active', b.dataset.apiMethod === method);
      });
      renderApiList();
    }

    function toggleApiSortOrder() {
      currentApiSortOrder = (currentApiSortOrder === 'desc') ? 'asc' : 'desc';
      const text = document.getElementById('apiSortOrderText');
      if (text) {
        text.textContent = currentApiSortOrder === 'desc' ? 'Time: Newest First ▾' : 'Time: Oldest First ▴';
      }
      renderApiList();
    }

    function toggleApiRow(id) {
      const drawer = document.getElementById('apiDrawer_' + id);
      const arrow = document.getElementById('apiArrow_' + id);
      if (!drawer) return;
      const isOpen = drawer.classList.contains('open');
      drawer.classList.toggle('open', !isOpen);
      if (arrow) {
        arrow.textContent = !isOpen ? 'Collapse ▴' : 'Inspect ▾';
      }
    }

    function renderApiList() {
      const container = document.getElementById('apiCardsList');
      if (!container) return;

      const httpLogs = logsCache.filter(e => e.source === 'http' || e.metadata?.http);
      const totalCalls = httpLogs.length;

      let postCount = 0;
      let getCount = 0;
      let putCount = 0;
      let deleteCount = 0;
      let errorCount = 0;
      let successCount = 0;
      let totalLatency = 0;

      for (const e of httpLogs) {
        const h = e.metadata?.http || {};
        const method = (h.method || 'GET').toUpperCase();
        const code = h.statusCode || (e.level === 'error' ? 500 : 200);

        if (method === 'POST') postCount++;
        else if (method === 'GET') getCount++;
        else if (method === 'PUT') putCount++;
        else if (method === 'DELETE') deleteCount++;

        if (code >= 400) errorCount++;
        else successCount++;

        totalLatency += (h.durationMs || 0);
      }

      // Update Method filter counters
      const setC = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      setC('apiCountAll', totalCalls);
      setC('apiCountPost', postCount);
      setC('apiCountGet', getCount);
      setC('apiCountPut', putCount);
      setC('apiCountDelete', deleteCount);
      setC('apiCountErrors', errorCount);

      const avgLatency = totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0;
      const kpiTotal = document.getElementById('kpiTotalApis');
      const kpiSuccess = document.getElementById('kpiSuccessApis');
      const kpiError = document.getElementById('kpiErrorApis');
      const kpiAvg = document.getElementById('kpiAvgLatency');

      if (kpiTotal) kpiTotal.textContent = totalCalls;
      if (kpiSuccess) kpiSuccess.textContent = successCount;
      if (kpiError) kpiError.textContent = errorCount;
      if (kpiAvg) kpiAvg.textContent = avgLatency + 'ms';

      const s = (document.getElementById('apiSearchInput')?.value || '').toLowerCase().trim();
      const statusFilter = document.getElementById('apiStatusFilter')?.value || 'all';
      const latencyFilter = document.getElementById('apiLatencyFilter')?.value || 'all';

      // Update clear search button
      const apiClearBtn = document.getElementById('apiSearchClearBtn');
      if (apiClearBtn) apiClearBtn.style.display = s ? 'inline-flex' : 'none';

      const filtered = httpLogs.filter(e => {
        const h = e.metadata?.http;
        if (!h) return false;

        if (currentApiMethodFilter === 'ERRORS') {
          if ((h.statusCode || 200) < 400) return false;
        } else if (currentApiMethodFilter !== 'all') {
          if ((h.method || '').toUpperCase() !== currentApiMethodFilter) return false;
        }

        // Status filter
        const code = h.statusCode || 200;
        if (statusFilter === '2xx' && (code < 200 || code >= 300)) return false;
        if (statusFilter === '3xx' && (code < 300 || code >= 400)) return false;
        if (statusFilter === '4xx' && (code < 400 || code >= 500)) return false;
        if (statusFilter === '5xx' && code < 500) return false;

        // Latency filter
        const lat = h.durationMs || 0;
        if (latencyFilter === 'fast' && lat >= 50) return false;
        if (latencyFilter === 'moderate' && lat < 100) return false;
        if (latencyFilter === 'slow' && lat < 500) return false;

        if (s) {
          const matchUrl = (h.url || '').toLowerCase().includes(s);
          const matchMethod = (h.method || '').toLowerCase().includes(s);
          const matchStatus = String(h.statusCode || '').includes(s);
          const matchIp = (h.clientIp || '').toLowerCase().includes(s);
          const matchReq = h.requestBody ? JSON.stringify(h.requestBody).toLowerCase().includes(s) : false;
          const matchRes = h.responseBody ? JSON.stringify(h.responseBody).toLowerCase().includes(s) : false;
          if (!matchUrl && !matchMethod && !matchStatus && !matchIp && !matchReq && !matchRes) return false;
        }

        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = 
          '<div style="text-align:center; padding:3rem; background:#0a0f1d; border:1px dashed var(--border-subtle); border-radius:8px; color:var(--text-muted);">' +
            '<svg class="icon" style="width:36px; height:36px; margin:0 auto 0.75rem auto; color:#64748b;" viewBox="0 0 24 24"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>' +
            '<div style="font-weight:600; color:#fff; font-size:0.95rem;">No API Requests Intercepted Yet</div>' +
            '<p style="font-size:0.8rem; margin:0.4rem 0 1rem 0;">No API calls matched your search or filters.</p>' +
            '<button class="btn btn-primary" onclick="triggerSimulatedApi()">' +
              '<svg class="icon icon-sm" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Send Simulated API Request Now' +
            '</button>' +
          '</div>';
        return;
      }

      container.innerHTML = '';
      const ordered = [...filtered];
      if (currentApiSortOrder === 'desc') {
        ordered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      } else {
        ordered.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      }

      for (const e of ordered) {
        const h = e.metadata?.http || {};
        const method = h.method || 'POST';
        const statusCode = h.statusCode || 200;
        const statusClass = statusCode >= 500 ? 'status-5xx' : (statusCode >= 400 ? 'status-4xx' : 'status-2xx');
        const methodClass = 'method-' + method;
        const timeStr = new Date(e.timestamp).toLocaleTimeString();
        const clientIp = h.clientIp || '127.0.0.1';

        const row = document.createElement('div');
        row.className = 'api-row-item';

        const hasReq = h.requestBody !== undefined && h.requestBody !== null;
        const isReqEnc = hasReq && (h.requestBody.encrypted || h.requestBody.__encrypted);
        const hasRes = h.responseBody !== undefined && h.responseBody !== null;
        const isResEnc = hasRes && (h.responseBody.encrypted || h.responseBody.__encrypted);

        const highlightedUrl = highlightSearch(h.url || e.message, s);
        const highlightedIp = highlightSearch(clientIp, s);

        let rowInner = 
          '<div class="api-row-header" onclick="toggleApiRow(this.dataset.id)" data-id="' + e.id + '">' +
            '<span class="method-badge ' + methodClass + '">' + method + '</span>' +
            '<span class="status-badge ' + statusClass + '">' + statusCode + '</span>' +
            '<span class="api-row-url" title="' + escapeHtml(h.url || e.message) + '">' + highlightedUrl + '</span>' +
            '<span class="api-pill" title="Execution Latency">⏱️ ' + (h.durationMs || 0) + 'ms</span>' +
            '<span class="api-pill api-pill-ip" title="Client IP Address" style="display:inline-flex; align-items:center; gap:4px;"><svg class="icon icon-sm" style="width:10px; height:10px;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg>' + highlightedIp + '</span>' +
            '<span style="color:#64748b; font-size:0.72rem; font-family:var(--font-mono);">' + timeStr + '</span>' +
            '<span class="btn" style="padding:2px 8px; font-size:0.68rem; margin-left:auto;" onclick="event.stopPropagation(); toggleApiRow(this.dataset.id)" data-id="' + e.id + '">' +
              '<span id="apiArrow_' + e.id + '">Inspect ▾</span>' +
            '</span>' +
          '</div>' +
          '<div id="apiDrawer_' + e.id + '" class="api-row-drawer">' +
            '<div class="api-drawer-grid">' +
              '<div class="payload-card">' +
                '<div class="payload-title-bar">' +
                  '<span style="color:#38bdf8; display:flex; align-items:center; gap:0.35rem;">' +
                    '<svg class="icon icon-sm" style="width:12px; height:12px;" viewBox="0 0 24 24"><path d="M12 17V3"/><path d="M6 11l6 6 6-6"/><path d="M19 21H5"/></svg> Request Payload (' + escapeHtml(clientIp) + ')' +
                    (isReqEnc ? ' <span class="badge" style="background:rgba(99,102,241,0.18); color:#a5b4fc; font-size:0.62rem; padding:1px 5px; border-radius:3px; border:1px solid rgba(99,102,241,0.3);">🔒 Encrypted</span>' : '') +
                  '</span>' +
                  '<div style="display:flex; gap:4px;">' +
                    (isReqEnc ? '<button class="btn" style="padding:1px 6px; font-size:0.65rem; color:#818cf8; border-color:rgba(129,140,248,0.3);" onclick="decryptPayloadInCard(this.dataset.id, this.dataset.type, this)" data-id="' + e.id + '" data-type="req">🔓 Decrypt</button>' : '');
        if (hasReq) {
          rowInner += '<button class="btn" style="padding:1px 6px; font-size:0.65rem;" onclick="copyPayload(this.dataset.target)" data-target="' + e.id + '_card_req">Copy JSON</button>';
        }
        rowInner += '</div></div>' +
          '<pre id="' + e.id + '_card_req" class="json-code">' + (hasReq ? highlightSearch(JSON.stringify(h.requestBody, null, 2), s) : '<span style="color:#64748b; font-style:italic;">(No Request Body)</span>') + '</pre>' +
        '</div>' +
        '<div class="payload-card">' +
          '<div class="payload-title-bar">' +
            '<span style="color:#10b981; display:flex; align-items:center; gap:0.35rem;">' +
              '<svg class="icon icon-sm" style="width:12px; height:12px;" viewBox="0 0 24 24"><path d="M12 3v14"/><path d="M18 9l-6-6-6 6"/><path d="M5 21h14"/></svg> Response Payload (' + statusCode + ')' +
              (isResEnc ? ' <span class="badge" style="background:rgba(99,102,241,0.18); color:#a5b4fc; font-size:0.62rem; padding:1px 5px; border-radius:3px; border:1px solid rgba(99,102,241,0.3);">🔒 Encrypted</span>' : '') +
            '</span>' +
            '<div style="display:flex; gap:4px;">' +
              (isResEnc ? '<button class="btn" style="padding:1px 6px; font-size:0.65rem; color:#818cf8; border-color:rgba(129,140,248,0.3);" onclick="decryptPayloadInCard(this.dataset.id, this.dataset.type, this)" data-id="' + e.id + '" data-type="res">🔓 Decrypt</button>' : '');
        if (hasRes) {
          rowInner += '<button class="btn" style="padding:1px 6px; font-size:0.65rem;" onclick="copyPayload(this.dataset.target)" data-target="' + e.id + '_card_res">Copy JSON</button>';
        }
        rowInner += '</div></div>' +
          '<pre id="' + e.id + '_card_res" class="json-code">' + (hasRes ? highlightSearch(JSON.stringify(h.responseBody, null, 2), s) : '<span style="color:#64748b; font-style:italic;">(No Response Body)</span>') + '</pre>' +
        '</div>' +
        '</div>' +
        '<div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.6rem;">' +
          '<button class="btn btn-sm" style="color:#f87171; border-color:rgba(239,68,68,0.3);" onclick="promptQuickExcludeRoute(this.dataset.url, this.dataset.method)" data-url="' + escapeHtml(h.url || e.message || '') + '" data-method="' + method + '"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><span>Skip Route</span></button>' +
          '<button class="btn btn-sm" onclick="copyApiCurl(this.dataset.id)" data-id="' + e.id + '"><svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy as cURL</span></button>' +
          '<button class="btn btn-sm" onclick="openLogModal(this.dataset.id)" data-id="' + e.id + '"><svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/></svg><span>Open in Full Inspector</span></button>' +
        '</div>' +
        '</div>';

        row.innerHTML = rowInner;
        container.appendChild(row);
      }
    }

    function copyApiCurl(id) {
      const entry = logsCache.find(e => e.id === id);
      if (!entry?.metadata?.http) return;
      const h = entry.metadata.http;
      let cmd = 'curl -X ' + (h.method || 'GET') + ' "' + location.origin + (h.url || '/') + '"';
      if (h.requestBody) {
        cmd += ' -H "Content-Type: application/json" -d ' + String.fromCharCode(39) + JSON.stringify(h.requestBody) + String.fromCharCode(39);
      }
      navigator.clipboard.writeText(cmd);
      showToast('cURL command copied to clipboard');
    }

    let apiSearchTimer = null;
    function handleApiSearchInput() {
      clearTimeout(apiSearchTimer);
      apiSearchTimer = setTimeout(renderApiList, 150);
    }

    async function triggerSimulatedApi() {
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: 'cust_' + Math.floor(Math.random() * 900 + 100),
            items: ['TracerNest-Logger Enterprise License', 'Dedicated Node Cluster'],
            total: 399.00,
            requestedAt: new Date().toISOString()
          })
        });

        if (res.ok) {
          showToast('Live API request sent. Request and response JSON intercepted.');
          if (document.getElementById('viewApis')?.classList.contains('active')) {
            setTimeout(renderApiList, 150);
          }
        } else {
          showToast('Simulated call returned HTTP ' + res.status, true);
        }
      } catch (err) {
        showToast('Simulate API error: ' + err.message, true);
      }
    }

    // Filter controls
    function setLevelFilter(lvl) {
      currentLevel = lvl;
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.level === lvl);
      });
      loadInitialLogs();
    }

    function toggleRegex() {
      isRegex = !isRegex;
      document.getElementById('regexChip').classList.toggle('active', isRegex);
      loadInitialLogs();
    }

    let searchTimer = null;
    function handleSearchInput() {
      const s = document.getElementById('searchInput')?.value.trim();
      const clearBtn = document.getElementById('searchClearBtn');
      if (clearBtn) clearBtn.style.display = s ? 'inline-flex' : 'none';
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadInitialLogs, 250);
    }

    function toggleAutoScroll() {
      autoScroll = !autoScroll;
      const b = document.getElementById('btnAutoScroll');
      b.innerHTML = autoScroll ? '<span>Auto-Scroll: ON</span>' : '<span>Auto-Scroll: OFF</span>';
      b.className = autoScroll ? 'btn btn-primary' : 'btn';
    }

    function togglePauseStream() {
      isPaused = !isPaused;
      document.getElementById('pauseIcon').textContent = isPaused ? '▶' : '⏸';
      document.getElementById('pauseText').textContent = isPaused ? 'Resume' : 'Pause';
    }

        // Custom Confirmation Dialog (No native confirm)
    let confirmResolver = null;
    function showConfirmDialog(options) {
      return new Promise((resolve) => {
        confirmResolver = resolve;
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const msgEl = document.getElementById('confirmMessage');
        const actionBtn = document.getElementById('confirmActionBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const iconWrap = document.getElementById('confirmIconWrap');

        if (titleEl) titleEl.textContent = options.title || 'Confirm Action';
        if (msgEl) msgEl.textContent = options.message || 'Are you sure you want to proceed?';
        if (actionBtn) {
          actionBtn.textContent = options.confirmText || 'Confirm';
          actionBtn.className = options.isDanger === false ? 'btn btn-primary' : 'btn btn-danger';
        }
        if (cancelBtn) cancelBtn.textContent = options.cancelText || 'Cancel';
        if (iconWrap) {
          if (options.isDanger === false) {
            iconWrap.style.background = 'rgba(56, 189, 248, 0.15)';
            iconWrap.style.color = 'var(--accent-primary)';
            iconWrap.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
          } else {
            iconWrap.style.background = 'rgba(239, 68, 68, 0.15)';
            iconWrap.style.color = 'var(--accent-error)';
            iconWrap.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
          }
        }
        if (modal) modal.classList.add('active');
      });
    }

    function resolveConfirm(result) {
      const modal = document.getElementById('confirmModal');
      if (modal) modal.classList.remove('active');
      if (confirmResolver) {
        confirmResolver(result);
        confirmResolver = null;
      }
    }

    function handleConfirmModalBackdropClick(e) {
      if (e.target.id === 'confirmModal') resolveConfirm(false);
    }

    // Health & Diagnostic Dialog Logic (No native alert)
    function openHealthModal(h, latencyMs) {
      const modal = document.getElementById('healthModal');
      if (modal) modal.classList.add('active');

      try {
        const dot = document.getElementById('hmStatusDot');
        const title = document.getElementById('hmStatusTitle');
        const statusSub = document.getElementById('hmStatusSub');
        const uptime = document.getElementById('hmUptimeBadge');
        const latency = document.getElementById('hmLatencyBadge');
        const db = document.getElementById('hmDatabaseVal');
        const dbSub = document.getElementById('hmDatabaseSub');
        const proc = document.getElementById('hmProcessVal');
        const procSub = document.getElementById('hmProcessSub');
        const mem = document.getElementById('hmMemoryVal');
        const memPct = document.getElementById('hmMemoryPct');
        const memBar = document.getElementById('hmMemoryBar');
        const buf = document.getElementById('hmBufferVal');
        const bufPct = document.getElementById('hmBufferPct');
        const bufBar = document.getElementById('hmBufferBar');
        const ttlPurged = document.getElementById('hmTtlPurgedVal');
        const throughput = document.getElementById('hmThroughputVal');
        const timestamp = document.getElementById('hmTimestampVal');
        const diagLatencyText = document.getElementById('hmDiagLatencyText');

        const status = (h?.status || 'healthy').toLowerCase();
        const isHealthy = status === 'healthy';
        const isDegraded = status === 'degraded';

        if (dot) {
          dot.style.background = isHealthy ? 'var(--accent-success)' : (isDegraded ? 'var(--accent-warning)' : 'var(--accent-error)');
          dot.style.boxShadow = isHealthy ? '0 0 10px rgba(16, 185, 129, 0.65)' : (isDegraded ? '0 0 10px rgba(245, 158, 11, 0.65)' : '0 0 10px rgba(239, 68, 68, 0.65)');
        }
        if (title) {
          title.textContent = 'System Status: ' + status.toUpperCase();
          title.style.color = isHealthy ? '#34d399' : (isDegraded ? '#fbbf24' : '#f87171');
        }
        if (statusSub) {
          statusSub.textContent = isHealthy
            ? 'All telemetry pipelines, SQL encryption stores, and ring buffers operational'
            : (isDegraded ? 'Telemetry active with degraded subsystem performance' : 'Critical subsystem failure detected');
        }
        if (uptime) uptime.textContent = 'Uptime: ' + (h?.uptimeFormatted || (h?.uptime ? h.uptime + 's' : '0s'));
        if (latency) latency.textContent = 'Latency: ' + (latencyMs !== undefined ? latencyMs + 'ms' : '< 1ms');

        if (db) {
          const dialect = (h?.database?.dialect || 'SQLite').toUpperCase();
          const dbStat = (h?.database?.status || 'CONNECTED').toUpperCase();
          db.textContent = dialect + ' (' + dbStat + ')';
        }
        if (dbSub) {
          dbSub.textContent = h?.database?.hasUsers ? 'RBAC Schema: Verified (Users Loaded)' : 'RBAC Schema: Initializing';
        }

        if (proc) {
          proc.textContent = 'PID ' + (h?.process?.pid || '-') + ' \u2022 ' + (h?.process?.nodeVersion || 'Node.js');
        }
        if (procSub) {
          procSub.textContent = 'Platform: ' + (h?.process?.platform || 'os') + ' (' + (h?.process?.arch || 'x64') + ')';
        }

        const heapUsed = h?.memory?.heapUsedMb || 0;
        const heapTotal = h?.memory?.heapTotalMb || 0;
        const heapPercent = Math.min(100, Math.max(0, h?.memory?.heapUsagePercent || (heapTotal ? Math.round((heapUsed / heapTotal) * 100) : 0)));
        if (mem) mem.textContent = heapUsed + ' MB / ' + heapTotal + ' MB';
        if (memPct) memPct.textContent = heapPercent + '%';
        if (memBar) {
          memBar.style.width = heapPercent + '%';
          memBar.style.background = heapPercent > 85 ? 'var(--accent-error)' : (heapPercent > 65 ? 'var(--accent-warning)' : 'var(--accent-primary)');
        }

        const bufCount = h?.logs?.bufferCount || 0;
        const bufCap = h?.logs?.capacity || 5000;
        const bufPercent = Math.min(100, Math.max(0, h?.logs?.bufferUsagePercent || (bufCap ? Math.round((bufCount / bufCap) * 100) : 0)));
        if (buf) buf.textContent = bufCount.toLocaleString() + ' / ' + bufCap.toLocaleString() + ' logs';
        if (bufPct) bufPct.textContent = bufPercent + '%';
        if (bufBar) {
          bufBar.style.width = bufPercent + '%';
          bufBar.style.background = bufPercent > 90 ? 'var(--accent-warning)' : 'var(--accent-success)';
        }

        if (ttlPurged) {
          ttlPurged.textContent = (h?.logs?.totalPurged || 0).toLocaleString() + ' logs evicted';
        }
        if (throughput) {
          throughput.textContent = (h?.logs?.throughputPerSec || 0) + ' logs/sec';
        }
        if (timestamp) {
          const ts = h?.timestamp ? new Date(h.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
          timestamp.textContent = 'Live snapshot at ' + ts;
        }
        if (diagLatencyText) {
          diagLatencyText.textContent = 'Diagnostic completed in ' + (latencyMs !== undefined ? latencyMs + 'ms' : '0ms') + ' \u2022 Subsystems verified';
        }
      } catch (err) {
        console.error('Error rendering health modal data:', err);
      }
    }

    function closeHealthModal() {
      const modal = document.getElementById('healthModal');
      if (modal) modal.classList.remove('active');
    }

    function handleHealthModalBackdropClick(e) {
      if (e.target.id === 'healthModal') closeHealthModal();
    }

    async function confirmClearLogs() {
      const confirmed = await showConfirmDialog({
        title: 'Clear Log Buffer',
        message: 'Are you sure you want to clear all log entries from the in-memory buffer? This will immediately reset your active stream.',
        confirmText: 'Clear Buffer',
        isDanger: true
      });
      if (!confirmed) return;
      const res = await fetch(\`\${BASE_PATH}/api/logs\`, {
        method: 'DELETE',
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      if (res.ok) {
        logsCache = [];
        renderLogs();
        showToast('Log buffer cleared');
      }
    }

    // Custom Export Dialog Logic (No native prompt)
    let selectedExportFormat = 'json';
    let selectedExportScope = 'filtered';

    function openExportMenu() {
      selectedExportFormat = 'json';
      selectedExportScope = 'filtered';
      setExportFormat('json');
      setExportScope('filtered');

      const modal = document.getElementById('exportModal');
      const filteredCountEl = document.getElementById('exportScopeFilteredCount');
      const allCountEl = document.getElementById('exportScopeAllCount');
      const filterSummaryEl = document.getElementById('exportActiveFiltersSummary');

      const filteredLogs = logsCache ? logsCache.length : 0;
      if (filteredCountEl) {
        filteredCountEl.textContent = filteredLogs + ' matching active filter' + (filteredLogs === 1 ? '' : 's');
      }
      if (allCountEl) {
        allCountEl.textContent = (totalLogsCount || filteredLogs) + ' total logs in buffer';
      }

      if (filterSummaryEl) {
        const parts = [];
        parts.push('Level: ' + (currentLevel || 'all').toUpperCase());
        parts.push('Source: ' + (currentSource || 'all').toUpperCase());
        if (currentTimeRange && currentTimeRange !== 'all') parts.push('Time: ' + currentTimeRange);
        const searchInput = document.getElementById('searchInput');
        const searchVal = searchInput ? searchInput.value.trim() : '';
        if (searchVal) parts.push('Query: "' + searchVal.slice(0, 16) + (searchVal.length > 16 ? '...' : '') + '"');
        filterSummaryEl.textContent = parts.join(' | ');
      }

      updateExportFilenamePreview();
      if (modal) modal.classList.add('active');
    }

    function setExportFormat(fmt) {
      selectedExportFormat = fmt;
      const formats = ['json', 'csv', 'ndjson'];
      for (const f of formats) {
        const el = document.getElementById('exportOpt' + f.charAt(0).toUpperCase() + f.slice(1));
        if (el) el.classList.toggle('active', f === fmt);
      }
      updateExportFilenamePreview();
    }

    function setExportScope(scope) {
      selectedExportScope = scope;
      const filteredEl = document.getElementById('exportScopeFiltered');
      const allEl = document.getElementById('exportScopeAll');
      if (filteredEl) filteredEl.classList.toggle('active', scope === 'filtered');
      if (allEl) allEl.classList.toggle('active', scope === 'all');
    }

    function updateExportFilenamePreview() {
      const prevEl = document.getElementById('exportFileNamePreview');
      if (prevEl) {
        const ext = selectedExportFormat === 'ndjson' ? 'ndjson' : selectedExportFormat;
        prevEl.textContent = 'tracernest-export-' + Date.now() + '.' + ext;
      }
    }

    function closeExportModal() {
      const modal = document.getElementById('exportModal');
      if (modal) modal.classList.remove('active');
    }

    function handleExportModalBackdropClick(e) {
      if (e.target.id === 'exportModal') closeExportModal();
    }

    async function submitExportDownload() {
      const btn = document.getElementById('btnSubmitExport');
      const origHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="icon icon-sm spin-animation" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Preparing...</span>';
      }

      let query = '';
      if (selectedExportScope === 'filtered') {
        query = buildQueryString();
      }
      const delim = query ? '&' : '?';
      const targetUrl = BASE_PATH + '/api/logs/export' + query + delim + 'format=' + selectedExportFormat;

      showToast('Generating ' + selectedExportFormat.toUpperCase() + ' telemetry export...');
      try {
        const res = await fetch(targetUrl, {
          headers: getAuthHeaders()
        });
        if (!res.ok) {
          throw new Error('Export request returned HTTP ' + res.status);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const ext = selectedExportFormat === 'ndjson' ? 'ndjson' : selectedExportFormat;
        a.download = 'tracernest-export-' + Date.now() + '.' + ext;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 150);

        closeExportModal();
        showToast('Export downloaded successfully (' + selectedExportFormat.toUpperCase() + ').');
      } catch (err) {
        showToast('Export failed: ' + err.message, true);
      } finally {
        if (btn && origHtml) {
          btn.disabled = false;
          btn.innerHTML = origHtml;
        }
      }
    }

    // TTL System Management
    async function loadTTLConfig() {
      try {
        const res = await fetch(\`\${BASE_PATH}/api/ttl\`, {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        if (res.ok) {
          const data = await res.json();
          document.getElementById('ttlPurgedBadge').textContent = \`Total Purged: \${data.totalPurged} logs\`;
          renderTTLTable(data.rules || []);
        }
      } catch {}
    }

    function renderTTLTable(rules) {
      const tbody = document.getElementById('ttlTableBody');
      tbody.innerHTML = '';
      for (const r of rules) {
        const tr = document.createElement('tr');
        const durStr = formatSeconds(r.ttlSeconds);
        tr.innerHTML = \`
          <td style="font-weight:600;">\${escapeHtml(r.name || r.id)}</td>
          <td><span class="severity-pill pill-\${r.level || 'info'}">\${(r.level || 'all').toUpperCase()}</span></td>
          <td style="text-transform:uppercase; font-size:0.75rem; color:#94a3b8;">\${r.source || 'all'}</td>
          <td style="font-family:var(--font-mono); font-size:0.75rem;">\${r.pattern ? escapeHtml(r.pattern) : '<span style="color:#64748b;">(All)</span>'}</td>
          <td style="font-weight:700; color:#38bdf8;">\${durStr}</td>
          <td>
            <button class="btn btn-danger" style="padding:2px 7px; font-size:0.7rem;" onclick="deleteTTLRule('\${r.id}')">Delete</button>
          </td>
        \`;
        tbody.appendChild(tr);
      }
    }

    async function handleCreateTTLRule(e) {
      e.preventDefault();
      const name = document.getElementById('ttlRuleName').value.trim();
      const level = document.getElementById('ttlRuleLevel').value;
      const source = document.getElementById('ttlRuleSource').value;
      const pattern = document.getElementById('ttlRulePattern').value.trim();
      const val = parseInt(document.getElementById('ttlDurationVal').value, 10);
      const unit = parseInt(document.getElementById('ttlDurationUnit').value, 10);
      const ttlSeconds = val * unit;

      const res = await fetch(\`\${BASE_PATH}/api/ttl/rules\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`
        },
        body: JSON.stringify({ name, level, source, pattern, ttlSeconds })
      });

      if (res.ok) {
        document.getElementById('ttlRuleName').value = '';
        document.getElementById('ttlRulePattern').value = '';
        showToast('TTL deletion rule registered!');
        loadTTLConfig();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create TTL rule', true);
      }
    }

    async function deleteTTLRule(id) {
      const confirmed = await showConfirmDialog({
        title: 'Remove TTL Rule',
        message: 'Are you sure you want to remove this TTL retention rule? Future matching logs will follow standard retention.',
        confirmText: 'Remove Rule',
        isDanger: true
      });
      if (!confirmed) return;
      const res = await fetch(\`\${BASE_PATH}/api/ttl/rules/\${id}\`, {
        method: 'DELETE',
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      if (res.ok) {
        showToast('TTL rule deleted');
        loadTTLConfig();
      }
    }

    async function triggerManualSweep() {
      showToast('Purging expired logs...');
      const res = await fetch(\`\${BASE_PATH}/api/ttl/purge\`, {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      if (res.ok) {
        const data = await res.json();
        showToast(\`Purge complete! Deleted \${data.purged} expired log entries.\`);
        loadTTLConfig();
        loadInitialLogs();
      }
    }

    function formatSeconds(sec) {
      if (sec >= 86400) return (sec / 86400).toFixed(1) + ' Days';
      if (sec >= 3600) return (sec / 3600).toFixed(1) + ' Hours';
      if (sec >= 60) return Math.round(sec / 60) + ' Mins';
      return sec + ' Secs';
    }

    // Excluded Sensitive Routes Management
    async function loadExcludedRoutes() {
      try {
        const res = await fetch(\`\${BASE_PATH}/api/excluded-routes\`, {
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          const rules = data.rules || [];
          const activeCount = rules.filter(r => r.enabled).length;
          const activeBadge = document.getElementById('exclActiveBadge');
          if (activeBadge) activeBadge.textContent = \`\${activeCount} Active / \${rules.length} Total Rules\`;
          const staticBadge = document.getElementById('exclStaticBadge');
          if (staticBadge) staticBadge.textContent = \`(\${data.staticCount || 0} Static Config Rules)\`;
          renderExcludedRoutesTable(rules, data.staticCount || 0);
        }
      } catch (err) {
        console.error('Failed to load excluded routes', err);
      }
    }

    function renderExcludedRoutesTable(rules, staticCount) {
      const tbody = document.getElementById('excludedRoutesTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (rules.length === 0) {
        const emptyTr = document.createElement('tr');
        emptyTr.innerHTML = \`
          <td colspan="6" style="text-align:center; padding:3rem 1.5rem; color:var(--text-muted);">
            <div style="width:40px; height:40px; border-radius:50%; background:rgba(56, 189, 248, 0.1); border:1px solid rgba(56, 189, 248, 0.2); display:flex; align-items:center; justify-content:center; margin:0 auto 0.75rem auto; color:#38bdf8;">
              <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </div>
            <div style="font-weight:600; color:#fff; font-size:0.95rem; margin-bottom:0.25rem;">No Sensitive Routes Excluded in UI</div>
            <div style="font-size:0.8rem; max-width:440px; margin:0 auto; line-height:1.4;">
              All incoming API traffic is currently tracked. Add route patterns above or click <b>"Skip Route"</b> directly from the API Requests list to protect sensitive endpoints from being recorded.
            </div>
          </td>
        \`;
        tbody.appendChild(emptyTr);
        return;
      }

      for (const r of rules) {
        const tr = document.createElement('tr');
        const method = (r.method || 'ALL').toUpperCase();
        let methodBadgeClass = 'method-ALL';
        if (method === 'POST') methodBadgeClass = 'method-POST';
        else if (method === 'GET') methodBadgeClass = 'method-GET';
        else if (method === 'PUT') methodBadgeClass = 'method-PUT';
        else if (method === 'DELETE') methodBadgeClass = 'method-DELETE';
        else if (method === 'PATCH') methodBadgeClass = 'method-PATCH';

        const createdStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-';
        const isEnabled = r.enabled !== false;

        const statusBadge = isEnabled
          ? '<span style="display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:12px; font-size:0.72rem; font-weight:600; background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3);"><span style="width:6px; height:6px; border-radius:50%; background:#10b981;"></span>Active (Skipping)</span>'
          : '<span style="display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:12px; font-size:0.72rem; font-weight:600; background:rgba(100,116,139,0.15); color:#94a3b8; border:1px solid rgba(100,116,139,0.3);"><span style="width:6px; height:6px; border-radius:50%; background:#94a3b8;"></span>Paused</span>';

        tr.innerHTML = \`
          <td><span class="method-badge \${methodBadgeClass}">\${method}</span></td>
          <td style="font-family:var(--font-mono); font-size:0.82rem; font-weight:600; color:#e2e8f0;">
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <svg class="icon icon-sm" style="width:12px; height:12px; color:#38bdf8;" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>\${escapeHtml(r.path)}</span>
            </div>
          </td>
          <td style="font-size:0.78rem; color:#94a3b8;">\${r.description ? escapeHtml(r.description) : '<span style="color:#64748b; font-style:italic;">No description provided</span>'}</td>
          <td>\${statusBadge}</td>
          <td style="font-size:0.72rem; color:#64748b; font-family:var(--font-mono);">\${createdStr}</td>
          <td style="text-align:right;">
            <div style="display:inline-flex; gap:0.4rem;">
              <button class="btn btn-sm" style="padding:2px 7px; font-size:0.7rem;" onclick="toggleExcludedRoute('\${r.id}')" title="\${isEnabled ? 'Pause skipping (resume tracking)' : 'Enable skipping'}">
                \${isEnabled ? 'Pause' : 'Resume'}
              </button>
              <button class="btn btn-danger btn-sm" style="padding:2px 7px; font-size:0.7rem;" onclick="deleteExcludedRoute('\${r.id}', '\${escapeHtml(r.path)}')" title="Delete exclusion rule">
                Delete
              </button>
            </div>
          </td>
        \`;
        tbody.appendChild(tr);
      }
    }

    function applyExclusionPreset(path, method, desc) {
      document.getElementById('exclPath').value = path;
      document.getElementById('exclMethod').value = method;
      document.getElementById('exclDesc').value = desc;
      document.getElementById('exclPath').focus();
    }

    async function handleCreateExcludedRoute(e) {
      e.preventDefault();
      const pathInput = document.getElementById('exclPath');
      const methodSelect = document.getElementById('exclMethod');
      const descInput = document.getElementById('exclDesc');

      const rawPath = pathInput.value.trim();
      if (!rawPath) {
        showToast('Please enter an API route path or pattern', true);
        return;
      }

      const method = methodSelect.value;
      const description = descInput.value.trim();

      const btn = document.getElementById('btnSaveExclusionRule');
      if (btn) btn.disabled = true;

      try {
        const res = await fetch(\`\${BASE_PATH}/api/excluded-routes\`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ path: rawPath, method, description })
        });

        if (res.ok) {
          pathInput.value = '';
          descInput.value = '';
          showToast('Sensitive route exclusion rule saved! Traffic will be skipped.');
          loadExcludedRoutes();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to save exclusion rule', true);
        }
      } catch (err) {
        showToast('Network error saving exclusion rule', true);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function toggleExcludedRoute(id) {
      try {
        const res = await fetch(\`\${BASE_PATH}/api/excluded-routes/\${id}/toggle\`, {
          method: 'PATCH',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          const stateStr = data.rule?.enabled ? 'resumed (skipping active)' : 'paused (tracking resumed)';
          showToast(\`Exclusion rule \${stateStr}\`);
          loadExcludedRoutes();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to toggle rule state', true);
        }
      } catch (err) {
        showToast('Network error updating rule', true);
      }
    }

    async function deleteExcludedRoute(id, pathName) {
      const confirmed = await showConfirmDialog({
        title: 'Delete Route Exclusion',
        message: \`Are you sure you want to stop skipping "\${pathName}"? TracerNest Logger will resume intercepting and recording all future calls to this API.\`,
        confirmText: 'Resume Tracking',
        isDanger: true
      });
      if (!confirmed) return;

      try {
        const res = await fetch(\`\${BASE_PATH}/api/excluded-routes/\${id}\`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          showToast(\`Exclusion rule for "\${pathName}" removed\`);
          loadExcludedRoutes();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to delete exclusion rule', true);
        }
      } catch (err) {
        showToast('Network error deleting rule', true);
      }
    }

    async function promptQuickExcludeRoute(url, method) {
      if (!url) return;
      const cleanUrl = url.split('?')[0];
      const confirmed = await showConfirmDialog({
        title: 'Skip Sensitive API Route',
        message: \`Do you want to exclude and stop tracking "\${cleanUrl}" (\${method})? No future requests or payloads will be stored in the database.\`,
        confirmText: 'Skip Route',
        isDanger: false
      });
      if (!confirmed) return;

      try {
        const res = await fetch(\`\${BASE_PATH}/api/excluded-routes\`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            path: cleanUrl,
            method: method || 'ALL',
            description: 'Excluded from API Explorer'
          })
        });

        if (res.ok) {
          showToast(\`Route "\${cleanUrl}" is now excluded from tracking!\`);
          switchView('exclusions');
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to exclude route', true);
        }
      } catch (err) {
        showToast('Network error creating exclusion rule', true);
      }
    }

    // Users Management
    async function loadUsers() {
      const res = await fetch(\`\${BASE_PATH}/api/users\`, {
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      if (res.ok) {
        const data = await res.json();
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        for (const u of data.users || []) {
          const tr = document.createElement('tr');
          tr.innerHTML = \`
            <td style="font-weight:600;">\${escapeHtml(u.username)}</td>
            <td><span class="role-tag \${u.role}">\${u.role}</span></td>
            <td>\${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>\${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleTimeString() : 'Never'}</td>
            <td>
              \${u.username !== currentUser.username ? \`<button class="btn btn-danger" style="padding:2px 7px; font-size:0.7rem;" onclick="deleteUser('\${u.id}')">Delete</button>\` : '<span style="color:#64748b; font-size:0.75rem;">(Current)</span>'}
            </td>
          \`;
          tbody.appendChild(tr);
        }
      }
    }

    async function handleCreateUser(e) {
      e.preventDefault();
      const username = document.getElementById('newUsername').value.trim();
      const password = document.getElementById('newPassword').value;
      const role = document.getElementById('newRole').value;

      const res = await fetch(\`\${BASE_PATH}/api/users\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`
        },
        body: JSON.stringify({ username, password, role })
      });

      if (res.ok) {
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        showToast(\`User "\${username}" created and persisted to SQL!\`);
        loadUsers();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create user', true);
      }
    }

    async function deleteUser(id) {
      const confirmed = await showConfirmDialog({
        title: 'Delete User Account',
        message: 'Permanently delete this user account from SQL storage? This user will immediately lose all access.',
        confirmText: 'Delete User',
        isDanger: true
      });
      if (!confirmed) return;
      const res = await fetch(\`\${BASE_PATH}/api/users/\${id}\`, {
        method: 'DELETE',
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      if (res.ok) {
        showToast('User deleted from SQL store');
        loadUsers();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to delete user', true);
      }
    }

    // Alerts Configuration (Teams & Email)
    async function loadAlertConfigs() {
      try {
        const res = await fetch(\`\${BASE_PATH}/api/alerts\`, {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        if (res.ok) {
          const data = await res.json();
          const teams = data.configs.find(c => c.channel === 'teams');
          if (teams) {
            document.getElementById('teamsEnabled').value = teams.enabled ? '1' : '0';
            document.getElementById('teamsThreshold').value = teams.levelThreshold;
            document.getElementById('teamsTitle').value = teams.maskedSettings.title || '';
            document.getElementById('teamsWebhookUrl').placeholder = teams.maskedSettings.webhookUrl || 'Saved (Encrypted)';
          }
          const email = data.configs.find(c => c.channel === 'email');
          if (email) {
            const s = email.maskedSettings;
            document.getElementById('smtpHost').value = s.host || '';
            document.getElementById('smtpPort').value = s.port || 587;
            document.getElementById('smtpSecure').value = s.secure ? '1' : '0';
            document.getElementById('smtpUser').value = s.user || '';
            document.getElementById('smtpFrom').value = s.from || '';
            document.getElementById('smtpTo').value = s.to || '';
            document.getElementById('smtpThreshold').value = email.levelThreshold;
            document.getElementById('smtpEnabled').value = email.enabled ? '1' : '0';
          }
        }
      } catch {}
    }

    async function handleSaveTeams(e) {
      e.preventDefault();
      const webhookUrl = document.getElementById('teamsWebhookUrl').value.trim();
      const title = document.getElementById('teamsTitle').value.trim();
      const levelThreshold = document.getElementById('teamsThreshold').value;
      const enabled = document.getElementById('teamsEnabled').value === '1';

      const payload = {
        channel: 'teams',
        enabled,
        levelThreshold,
        settings: { title, webhookUrl }
      };

      const res = await fetch(\`\${BASE_PATH}/api/alerts\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast('Microsoft Teams webhook encrypted & saved to SQL!');
        loadAlertConfigs();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save Teams integration', true);
      }
    }

    async function handleSaveEmail(e) {
      e.preventDefault();
      const host = document.getElementById('smtpHost').value.trim();
      const port = parseInt(document.getElementById('smtpPort').value, 10);
      const secure = document.getElementById('smtpSecure').value === '1';
      const user = document.getElementById('smtpUser').value.trim();
      const password = document.getElementById('smtpPass').value;
      const from = document.getElementById('smtpFrom').value.trim();
      const to = document.getElementById('smtpTo').value.trim();
      const levelThreshold = document.getElementById('smtpThreshold').value;
      const enabled = document.getElementById('smtpEnabled').value === '1';

      const payload = {
        channel: 'email',
        enabled,
        levelThreshold,
        settings: { host, port, secure, user, password, from, to }
      };

      const res = await fetch(\`\${BASE_PATH}/api/alerts\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast('Email credentials encrypted & saved to SQL file!');
        loadAlertConfigs();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save Email configuration', true);
      }
    }

    async function triggerTestAlert(channel) {
      showToast(\`Dispatching test alert to \${channel.toUpperCase()}...\`);
      try {
        const res = await fetch(\`\${BASE_PATH}/api/alerts/test\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${token}\`
          },
          body: JSON.stringify({ channel })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message);
        } else {
          showToast(data.message || 'Alert failed', true);
        }
      } catch (err) {
        showToast('Connection error sending test alert', true);
      }
    }

    // Security Audit Trail
    async function loadAuditLogs() {
      const res = await fetch(\`\${BASE_PATH}/api/audit\`, {
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      if (res.ok) {
        const data = await res.json();
        const tbody = document.getElementById('auditTableBody');
        tbody.innerHTML = '';
        for (const a of data.entries || []) {
          const tr = document.createElement('tr');
          const d = new Date(a.timestamp);
          tr.innerHTML = \`
            <td style="color:#64748b; white-space:nowrap;">\${d.toLocaleDateString()} \${d.toLocaleTimeString()}</td>
            <td style="font-weight:700; color:#38bdf8;">\${escapeHtml(a.action)}</td>
            <td>\${escapeHtml(a.username || 'System')}</td>
            <td style="color:#64748b;">\${escapeHtml(a.ip || '-')}</td>
            <td style="font-family:var(--font-mono); font-size:0.75rem;">\${a.details ? escapeHtml(JSON.stringify(a.details)) : '-'}</td>
          \`;
          tbody.appendChild(tr);
        }
      }
    }

    // Stats & Health polling
    function startStatsPolling() {
      setInterval(async () => {
        if (!token) return;
        try {
          const res = await fetch(\`\${BASE_PATH}/api/metrics\`, {
            headers: { 'Authorization': \`Bearer \${token}\` }
          });
          if (res.ok) {
            const data = await res.json();
            const s = data.stats;
            document.getElementById('mThroughput').textContent = s.logsPerSecond + ' /s';
            document.getElementById('mTotal').textContent = s.totalLogs;
            document.getElementById('mErrors').textContent = s.errorCount;
            document.getElementById('mHeap').textContent = s.memoryUsageMb + ' MB';
            document.getElementById('mBuffer').textContent = s.bufferUsagePercent + '%';
            document.getElementById('mPurged').textContent = s.expiredLogsPurged || 0;
          }
        } catch {}

        try {
          const healthRes = await fetch(\`\${BASE_PATH}/api/health\`, { headers: getAuthHeaders() });
          if (healthRes.ok) {
            const h = await healthRes.json();
            const txt = document.getElementById('healthText');
            const dot = document.getElementById('topbarHealthDot');
            if (txt) {
              txt.textContent = 'Health: ' + (h.status === 'healthy' ? 'OK' : h.status.toUpperCase());
            }
            if (dot) {
              dot.className = 'sync-dot health-dot ' + (h.status === 'healthy' ? '' : (h.status === 'degraded' ? 'degraded' : 'unhealthy'));
              dot.style.background = h.status === 'healthy' ? '#10b981' : (h.status === 'degraded' ? '#f59e0b' : '#ef4444');
            }
            const srvStatus = document.getElementById('healthCardStatus');
            if (srvStatus) {
              srvStatus.textContent = h.status.toUpperCase();
              srvStatus.style.background = h.status === 'healthy' ? 'rgba(16,185,129,0.18)' : (h.status === 'degraded' ? 'rgba(245,158,11,0.18)' : 'rgba(239,68,68,0.18)');
              srvStatus.style.color = h.status === 'healthy' ? '#34d399' : (h.status === 'degraded' ? '#fbbf24' : '#f87171');
              srvStatus.style.borderColor = h.status === 'healthy' ? 'rgba(16,185,129,0.35)' : (h.status === 'degraded' ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.35)');
            }
            const srvUptime = document.getElementById('healthCardUptime');
            if (srvUptime) srvUptime.textContent = h.uptimeFormatted;
            const srvDb = document.getElementById('healthCardDb');
            if (srvDb) srvDb.textContent = (h.database?.dialect || 'SQLite').toUpperCase() + ' (' + (h.database?.status || 'OK').toUpperCase() + ')';
            const srvNode = document.getElementById('healthCardNode');
            if (srvNode) srvNode.textContent = (h.process?.nodeVersion || 'Node') + ' on ' + (h.process?.platform || 'os');
          }
        } catch {}
      }, 3000);
    }

    async function runHealthDiagnostic() {
      const btn = document.getElementById('btnRunDiagnostic');
      const modalBtn = document.getElementById('btnModalRerun');
      const origBtnHtml = btn ? btn.innerHTML : '';
      const origModalBtnHtml = modalBtn ? modalBtn.innerHTML : '';

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="icon icon-sm spin-animation" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Diagnosing...</span>';
      }
      if (modalBtn) {
        modalBtn.disabled = true;
        modalBtn.innerHTML = '<svg class="icon icon-sm spin-animation" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Running...</span>';
      }

      showToast('Running live server health diagnostic...');
      const t0 = performance.now();
      try {
        const res = await fetch(\`\${BASE_PATH}/api/health\`, { headers: getAuthHeaders() });
        const t1 = performance.now();
        const latencyMs = Math.round(t1 - t0);
        if (!res.ok && res.status !== 503) {
          throw new Error('Server returned HTTP ' + res.status);
        }
        const h = await res.json();
        openHealthModal(h, latencyMs);
        showToast('Diagnostic completed (' + latencyMs + 'ms): ' + (h.status || 'OK').toUpperCase());
      } catch (err) {
        showToast('Health diagnostic request failed: ' + err.message, true);
      } finally {
        if (btn && origBtnHtml) {
          btn.disabled = false;
          btn.innerHTML = origBtnHtml;
        }
        if (modalBtn && origModalBtnHtml) {
          modalBtn.disabled = false;
          modalBtn.innerHTML = origModalBtnHtml;
        }
      }
    }

    // Initial Setup Onboarding
    async function handleInitialSetup(e) {
      e.preventDefault();
      const errBox = document.getElementById('setupErrorMsg');
      const submitBtn = document.getElementById('setupSubmitBtn');
      if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }

      const username = document.getElementById('setupUsername').value.trim();
      const password = document.getElementById('setupPassword').value;
      const confirm = document.getElementById('setupPasswordConfirm').value;

      if (!username || !password) {
        if (errBox) {
          errBox.textContent = 'Username and password are required.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (password.length < 6) {
        if (errBox) {
          errBox.textContent = 'Password must be at least 6 characters long.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (password !== confirm) {
        if (errBox) {
          errBox.textContent = 'Passwords do not match.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Creating Root Administrator...';
      }

      try {
        const res = await fetch(\`\${BASE_PATH}/api/auth/setup\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        let data;
        try {
          data = await res.json();
        } catch {
          data = { error: 'Server returned status ' + res.status };
        }

        if (res.ok && data.token) {
          token = data.token;
          sessionStorage.setItem('logvault_token', token);
          currentUser = data.user;
          showDashboard();
          showToast('Root administrator created in encrypted SQL database!');
          updateUserHeader();
          applyRBAC();
          await loadInitialLogs();
          startSSEStream();
          startStatsPolling();
        } else {
          const msg = (data.error && data.details) ? (data.error + ': ' + data.details) : (data.error || 'Failed to initialize account');
          if (errBox) {
            errBox.textContent = msg;
            errBox.style.display = 'block';
          } else {
            showToast(msg, true);
          }
        }
      } catch (err) {
        if (errBox) {
          errBox.textContent = 'Connection error: ' + (err.message || 'Could not connect to TracerNest-Logger server');
          errBox.style.display = 'block';
        } else {
          showToast('Connection error: ' + err.message, true);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Initialize Security & Sign In';
        }
      }
    }

    // Standard Login
    async function handleLogin(e) {
      e.preventDefault();
      const errBox = document.getElementById('loginErrorMsg');
      const submitBtn = document.getElementById('loginSubmitBtn');
      if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }

      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!username || !password) {
        if (errBox) {
          errBox.textContent = 'Please enter both username and password.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Signing in...';
      }

      try {
        const res = await fetch(\`\${BASE_PATH}/api/auth/login\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        let data;
        try {
          data = await res.json();
        } catch {
          data = { error: 'Server returned HTTP ' + res.status };
        }

        if (res.ok && data.token) {
          token = data.token;
          sessionStorage.setItem('logvault_token', token);
          currentUser = data.user;
          if (data.mustChangePassword || (currentUser && currentUser.mustChangePassword)) {
            showAuthScreen('change_password');
            showToast('Please set your permanent password to continue.', false);
            return;
          }
          showDashboard();
          updateUserHeader();
          applyRBAC();
          await loadInitialLogs();
          startSSEStream();
          startStatsPolling();
          showToast('Welcome back, ' + currentUser.username);
        } else {
          const msg = data.error || ('Authentication failed with status ' + res.status);
          if (errBox) {
            errBox.textContent = msg;
            errBox.style.display = 'block';
          } else {
            showToast(msg, true);
          }
        }
      } catch (err) {
        if (errBox) {
          errBox.textContent = 'Connection error: ' + (err.message || 'Could not connect to TracerNest-Logger server');
          errBox.style.display = 'block';
        } else {
          showToast('Connection error: ' + err.message, true);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Sign In';
        }
      }
    }

    async function handleChangePassword(e) {
      e.preventDefault();
      const errBox = document.getElementById('changePassErrorMsg');
      const submitBtn = document.getElementById('changePassSubmitBtn');
      if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }

      const newPassword = document.getElementById('newAdminPassword').value;
      const confirmPassword = document.getElementById('newAdminPasswordConfirm').value;

      if (!newPassword || newPassword.length < 6) {
        if (errBox) {
          errBox.textContent = 'Password must be at least 6 characters.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (newPassword !== confirmPassword) {
        if (errBox) {
          errBox.textContent = 'Passwords do not match.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Updating password...';
      }

      try {
        const res = await fetch(\`\${BASE_PATH}/api/auth/change-password\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${token}\`
          },
          body: JSON.stringify({ newPassword })
        });

        let data;
        try {
          data = await res.json();
        } catch {
          data = { error: 'Server returned HTTP ' + res.status };
        }

        if (res.ok) {
          if (data && data.token) {
            token = data.token;
            sessionStorage.setItem('logvault_token', token);
          }
          if (currentUser) currentUser.mustChangePassword = false;
          showDashboard();
          updateUserHeader();
          applyRBAC();
          await loadInitialLogs();
          startSSEStream();
          startStatsPolling();
          showToast('Password updated successfully! Welcome to TracerNest-Logger.');
        } else {
          const msg = data.error || 'Failed to update password';
          if (errBox) {
            errBox.textContent = msg;
            errBox.style.display = 'block';
          } else {
            showToast(msg, true);
          }
        }
      } catch (err) {
        if (errBox) {
          errBox.textContent = 'Connection error: ' + (err.message || 'Could not connect to TracerNest-Logger server');
          errBox.style.display = 'block';
        } else {
          showToast('Connection error: ' + err.message, true);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Update Password & Open Console';
        }
      }
    }

    function handleLogout() {
      fetch(\`\${BASE_PATH}/api/auth/logout\`, { method: 'POST', headers: { 'Authorization': \`Bearer \${token}\` } }).catch(() => {});
      token = '';
      currentUser = null;
      sessionStorage.removeItem('logvault_token');
      document.cookie = 'tracernest_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax;';
      if (eventSource) eventSource.close();
      showAuthScreen('login');
    }

    function showToast(msg, isError = false) {
      const box = document.getElementById('toastBox');
      const text = document.getElementById('toastMsg');
      text.textContent = msg;
      box.className = 'toast-box ' + (isError ? 'error' : 'success');
      box.style.display = 'flex';
      setTimeout(() => { box.style.display = 'none'; }, 3500);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    window.addEventListener('DOMContentLoaded', init);
  </script>
</body>
</html>`;
}
//# sourceMappingURL=dashboard-html.js.map