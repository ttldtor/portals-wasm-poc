# Portals WASM gallery POC

A static Portals gallery for browser and Telegram Mini App experiments, with keyboard, mouse and tap input.

**Demo:** https://ttldtor.github.io/portals-wasm-poc/

This is an unreleased prototype based on [Portals v0.3.0](https://github.com/ttldtor/portals/releases/tag/v0.3.0), with a shared nonblocking runtime/session extension. It is not the unmodified release or a production browser backend. The C++ gallery form and fluent API are preserved.

## Try it

Click or tap the checkbox and buttons directly. Click or tap the text field to focus it, then type; Enter commits. Tab changes focus and Space toggles the checkbox. Use the page's **Theme** button or F2 to change the terminal theme. The gallery's **Run** handler updates a visible run counter below the terminal while leaving field models unchanged. Activate Quit to finish; reload to restart. Browsers may reserve function keys.

Mouse clicks use xterm.js SGR mouse reporting. A primary touch or pen tap of up to 500 ms, moving no more than 10 CSS pixels and ending in the same cell, is translated to the same cell-coordinate protocol for the existing runtime. Swipes, long presses, cancelled touches and multiple fingers do not activate controls; touch dragging, pinch gestures and long-press selection are outside this POC. Shift-click retains xterm's normal text-selection behavior. There are no touch equivalents for every terminal key.

For Telegram, set the demo HTTPS URL as your bot's menu button with BotFather `/setmenubutton`. This demo uses no bot token, webhook, application server, user authentication or user-data storage. The Telegram SDK loads from its official HTTPS URL.

The page handles Telegram viewport, safe-area and theme changes and pauses runtime steps and input while hidden or inactive. It reduces the terminal font on narrow or short screens to fit the gallery's 40-column, six-row minimum, restoring the normal size when space is available. The visual viewport limits the page height when the software keyboard opens. Mouse and touch interactions are tested with real Chromium input events at narrow and resized viewports. Android taps and text entry have also been reported working by the user; keyboard layout, IME and further device compatibility remain subject to real-device testing. Mocked SDK tests do not establish compatibility with actual Telegram clients.

## Develop the page

Use Node.js 24 and the pinned npm lockfile:

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

Playwright starts and stops its test server. Local tests serve below `/portals-wasm-poc/` to exercise GitHub Pages project paths. To run browser checks against the deployed site, set `PORTALS_PAGES_LIVE` to its full URL, including the trailing slash. Those checks temporarily intercept requests within their own browser sessions and do not alter the site.

`main.js`, `main.css` and source maps are generated from `src/`. The loader and WASM are rebuilt Release artifacts with the optional Run host notification. `npm run build` verifies their recorded hashes first. Pages publishes the repository root with `.nojekyll`; no custom deployment workflow is required.

The build also updates JS/CSS cache keys in `index.html` and uses a shared key for the runtime loader and WASM. These keys take effect after loading the new HTML; an already open Mini App or cached HTML may still require a full reload.

## Runtime source

[provenance.json](provenance.json) records the base commit and binary hashes. To rebuild the C++ runtime, check out Portals commit `080e5ea63bb813a97b996b156c7a5d9b5ee1d114`, apply [the runtime patch](source/portals-wasm-poc.patch) followed by [the browser Run notification patch](source/browser-run-feedback.patch), and activate Emscripten 6.0.12 with `EMSDK` set:

```sh
git apply /absolute/path/to/portals-wasm-poc.patch
git apply /absolute/path/to/browser-run-feedback.patch
cmake --preset wasm-release
cmake --build --preset wasm-release
```

The loader and WASM are produced under `build/wasm-release/wasm-gallery/`. The runtime uses native Wasm exceptions, without Asyncify, JSPI or pthreads. Replacing those artifacts here requires updating provenance hashes and repeating verification.

The optional `portalsRun` module callback runs synchronously when the gallery invokes its existing application action. The page uses it for feedback; missing callbacks are supported. Native gallery sources and the fluent API are unchanged.

Portals documentation remains separate: https://ttldtor.github.io/portals/.

## Licenses

Portals and this host use [BSL-1.0](LICENSE.txt). Third-party notices and full licenses are included in `LICENSES.txt`, `PORTALS-LICENSE.txt`, `UTF8PROC-LICENSE.md`, `XTERM-LICENSE.txt` and `XTERM-FIT-LICENSE.txt`.
