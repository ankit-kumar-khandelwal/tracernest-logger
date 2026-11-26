# Accessibility Statement for TracerNest Logger (LogVault)

**TracerNest Logger** is committed to providing a high-performance, developer-friendly, and accessible telemetry, flight recorder, and log vault experience for everyone, regardless of ability, neurodiversity, or situational disability.

We believe that observability, logging, and application monitoring tools must be inclusive and universally usable across command-line interfaces, terminal environments, and graphical web dashboards.

---

## Accessibility Standards & Compliance Target

We aim to adhere to the **[Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/) Level AA** standards and modern **WAI-ARIA (Web Accessibility Initiative - Accessible Rich Internet Applications)** specifications for our web dashboard interface.

### Core Accessibility Principles
1. **Perceivable:** Information and user interface components must be presentable to users in ways they can perceive (text alternatives, clear color contrast, dual light/dark themes, scalable typography).
2. **Operable:** User interface components and navigation must be operable via diverse input methods, including keyboard-only navigation, screen readers, and switch devices (no keyboard traps, visible focus rings, pause controls for high-speed live streams).
3. **Understandable:** Information and the operation of the user interface must be understandable (consistent layout, intuitive dialogs, clear error announcements, human-readable status indicators).
4. **Robust:** Content must be robust enough that it can be interpreted by a wide variety of user agents, assistive technologies, and modern browsers without third-party proprietary plugins.

---

## Supported Environments & Assistive Technologies

The TracerNest Logger dashboard and documentation are designed and tested to be compatible with:

### Operating Systems & Browsers
* **Browsers:** Current and evergreen versions of Google Chrome, Mozilla Firefox, Microsoft Edge, Apple Safari, and Chromium-based browsers (Brave, Opera).
* **Platforms:** Linux, macOS, Windows 10/11, iOS, and Android.
* **Display Scaling:** Fully functional when zoomed from **100% up to 400%** using standard browser zoom and responsive viewport scaling without breaking horizontal layout or obscuring controls.

### Assistive Technologies
* **Screen Readers:**
  * **NVDA** (NonVisual Desktop Access) on Windows.
  * **JAWS** (Job Access With Speech) on Windows.
  * **VoiceOver** on macOS and iOS.
  * **Orca** on Linux desktop distributions.
  * **TalkBack** on Android devices.
* **Keyboard Navigation:** 100% operable using standard keyboard inputs (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, arrow keys) with prominent, high-contrast focus rings.
* **Speech Recognition:** Compatible with Dragon NaturallySpeaking and OS-native voice control software.
* **System Display Preferences:** Automatically respects operating system preferences for:
  * `prefers-color-scheme: dark` / `light`
  * `prefers-reduced-motion: reduce` (disables auto-scrolling animations and rapid transitions)
  * High Contrast / Forced Colors modes (Windows Contrast Themes).

---

## Key Accessibility Features in TracerNest

### 1. Semantic Structure & ARIA Semantics
* Landmark roles (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`) allow screen reader users to jump directly to critical dashboard sections.
* All interactive modals (Full Inspect Log modal, Health Probes modal, User Management modal, Route Exclusion dialog) implement:
  * `role="dialog"` or `role="alertdialog"`
  * `aria-modal="true"`
  * `aria-labelledby` referencing the dialog title
  * `aria-describedby` referencing modal subtitles or status summaries
  * Focus trapping within active dialogs and focus restoration to the trigger button upon closing.

### 2. Keyboard-Only Navigation
* Every actionable element (buttons, filters, search inputs, pagination controls, drawer toggles, and table rows) can be reached and activated using the keyboard alone.
* Focus indicators use high-visibility outlines (`outline: 2px solid var(--accent)`) that remain distinct against both dark and light theme backgrounds.
* Pressing `Escape` instantly dismisses any open modal, dropdown drawer, or popover overlay without unexpected page reloads.

### 3. Color Contrast & Multi-Modal Indicators
* All text, badges, and interface controls meet or exceed WCAG 2.1 Level AA minimum contrast ratios (**4.5:1** for regular text, **3:1** for large text and UI components).
* Information is never conveyed through color alone:
  * HTTP status codes pair colors with explicit numeric codes and text descriptions (e.g., green with `200 OK`, amber with `401 Unauthorized`, red with `500 Internal Error`).
  * Log levels (Error, Warn, Info, Debug, Fatal) include visual iconography, distinct badges, and textual labels.

### 4. Live Stream & Motion Controls
* **Live Feed Pause Control:** High-frequency logging streams can trigger rapid, disorienting screen reader updates. Users can pause the real-time Server-Sent Events (SSE) feed at any time via a single keyboard-accessible button (`Pause Stream`) to read and inspect logs at their own pace.
* **Reduced Motion:** When `prefers-reduced-motion` is enabled in user system settings, all pulse animations, modal entrance slide-ins, and auto-scrolling effects are disabled or replaced with immediate state changes.

---

## Known Limitations & Planned Enhancements

While we strive for comprehensive accessibility, certain edge cases in developer telemetry present unique challenges:

| Area | Current Behavior | Planned Enhancement / Workaround |
| :--- | :--- | :--- |
| **High-Volume SSE Stream** | Live logs arriving faster than 50 events/sec may flood screen reader buffers if continuous reading is enabled. | Use the **Pause Stream** toggle or apply route/level filters before triaging logs. We are adding an adjustable throttling throttle for assistive output. |
| **Multi-Megabyte Raw Payloads** | Very large minified JSON payloads or stack traces in the Inspect modal may require extensive scrolling. | Use the built-in **Format JSON** toggle or the **Export NDJSON** feature to inspect logs in an external editor of choice. |
| **Terminal ANSI Streams** | Raw terminal stdout/stderr containing ASCII escape codes may read verbosely in screen readers. | We strip dangerous control sequences and provide plain-text copy-to-clipboard buttons for clean parsing. |

---

## Feedback & How to Report Accessibility Barriers

We welcome feedback and reports on any accessibility barriers you encounter when using TracerNest Logger, our web dashboard, or our documentation.

If you identify an area where accessibility can be improved, please report it through any of the following channels:

* **GitHub Issues (Preferred):**  
  Open an issue in our repository: [TracerNest Logger Issues](https://github.com/ankit-kumar-khandelwal/tracernest-logger/issues)  
  *Please use or include the `accessibility` or `a11y` label in the issue title or description.*

* **Email Contact:**  
  Send an email directly to our lead architect and maintainer:  
  **`ankitkhandelwal0003@gmail.com`**

### What to Include in Your Report
To help us reproduce and resolve the barrier efficiently, please include:
1. **Operating System and Browser:** (e.g., Windows 11 with Firefox 120, macOS Sonoma with Safari 17).
2. **Assistive Technology:** (e.g., NVDA 2024.1, VoiceOver, Keyboard-only).
3. **Location / Component:** (e.g., Inspect Log Modal, SSE Filter Bar, Health Diagnostics dialog).
4. **Description:** What happened, what you expected to happen, and any barriers experienced.

### Our Response Timeline
* **Initial Acknowledgment:** Within **24 to 48 hours**.
* **Triage & Remediation Plan:** Within **5 business days**.
* Accessibility barriers are treated with high priority alongside core functionality and security bug fixes.

---

## Governance & Continuous Assessment

TracerNest's accessibility compliance is evaluated through:
* **Automated Accessibility Testing:** Integrated axe-core, Pa11y, and Lighthouse accessibility audits.
* **Manual Testing:** Regular keyboard navigation passes, screen reader traversals, and high-contrast verification across both dark and light themes.

---

*Last Updated: November 2026*
