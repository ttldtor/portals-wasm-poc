# Portals WASM gallery POC

A static Portals Gallery, phone Level and experimental Moto arcade for browser and Telegram Mini App experiments.

**Demo:** https://ttldtor.github.io/portals-wasm-poc/

This is an unreleased prototype based on [Portals v0.3.0](https://github.com/ttldtor/portals/releases/tag/v0.3.0), with a shared nonblocking runtime/session extension and a dedicated fluent C++ browser sample. The existing native examples and library API are unchanged.

## Try it

Choose **Gallery**, **Level** or **Moto** above the terminal. Each switch starts a fresh scene, retaining the selected theme. Click or tap the checkbox and buttons inside the terminal. Click or tap the text field to focus it, then type; Enter commits. Tab moves forward, Shift+Tab moves backward, and Space toggles the checkbox. **Theme** or F2 changes the theme; **Quit** or F10 finishes the current scene. The application selector remains available to restart or switch. Browsers may reserve function keys.

**Level** displays two screen-relative tilt angles and a bubble in a crosshair. **Zero** sets the current device pose as the reference. The bubble saturates at ±30°, with a 0.7° dead zone; readings use a simple low-pass filter. Its row is green when level, yellow below 10° and red at larger tilt. Screen rotation is compensated in quarter turns. This is a demonstration, not a calibrated measurement instrument.

Level requests [Telegram DeviceOrientation](https://core.telegram.org/bots/webapps#deviceorientation) on supported Telegram 8.0+ clients, at a requested 50 ms interval. No browser sensor fallback is included. Without the API, the screen explicitly shows `Sensor unavailable` and Zero stays disabled. Level keeps terminal input read-only to avoid opening the mobile software keyboard; hardware keyboard navigation still works. Gallery restores normal text entry.

Sensor acquisition runs only in Level or Moto and stops on leaving, Quit, page hide or Telegram inactivity. On resume the scene waits for a new valid sample. Session tags reject callbacks retained from an older scene. The adapter allows one outstanding SDK start request; if that request never settles, a later session remains waiting. Telegram's global native sensor events have no request ID, so arbitrary delayed native events across restarts cannot be attributed perfectly. The adapter tests cover retained JS callbacks and the SDK callback-drain behavior; physical-device sensor behavior needs device testing.

The gallery title uses the selected theme's table `HEADER` foreground, background and text attributes, adapted to the title label in the form's Grid.

**Run something** animates the label from `(S)omething` through `somethin(G)` and back to `(S)omething`, with one transition every 300 ms. Run is disabled until the single pass finishes, approximately 4.8 seconds later. Input and the other actions remain available. Runtime stepping pauses while the page is hidden or Telegram is inactive; the next animation deadline is scheduled from the current runtime time, without a burst of missed frames.

Mouse clicks use xterm.js SGR mouse reporting. A primary touch or pen tap of up to 500 ms, moving no more than 10 CSS pixels and ending in the same cell, is translated to the same cell-coordinate protocol for the existing runtime. Swipes, long presses, cancelled touches and multiple fingers do not activate controls; touch dragging, pinch gestures and long-press selection are outside this POC. Shift-click retains xterm's normal text-selection behavior. There are no touch equivalents for every terminal key.

For Telegram, set the demo HTTPS URL as your bot's menu button with BotFather `/setmenubutton`. This demo uses no bot token, webhook, application server, user authentication or user-data storage. The Telegram SDK loads from its official HTTPS URL.

The page handles Telegram viewport, safe-area and theme changes. It reduces the terminal font on narrow or short screens to fit Gallery's 22-column, 11-row, Level's 25-column, 19-row or Moto's 32-column, 20-row minimum, restoring the normal size when space is available. The minimum font is 10px; extremely small viewports may still clip. The visual viewport limits page height when the software keyboard opens. The terminal uses its alternate screen to keep rows stable during resizing. Mouse and touch interactions are tested with Chromium input events. The previous gallery fit and worked on the user's Android device; the redesigned sample, IME and further device compatibility require real-device testing. Mocked SDK tests do not establish compatibility with actual Telegram clients.

## Moto experiment

Moto runs inside this same Mini App and uses the same terminal, runtime and Telegram sensor bridge. It does not require a second bot or a new entry URL.

Choose a numeric route seed, press **Start**, release it, then hold the phone comfortably and still. The press impulse is discarded before collecting a stable neutral pose. A short countdown starts the race. Tilt left/right to steer, away from you for gas and towards you to brake. **Gas** and **Brake** are large held zones; two fingers work independently, with brake taking priority. Keyboard users can hold Space or Enter on a focused pedal.

The centre button pauses the race. **Continue** keeps the locked neutral; **Recalibrate** requires a fresh press, release and steady window. Releasing a cancelled pointer never completes calibration. Inactivity, a stale sensor, a long frame gap or screen rotation pauses the race and releases holds. Rotation requires recalibration. **Restart route** resets progress with the same seed and allows choosing a different seed before starting.

The road is generated from seed, generator version and route position, with a fixed 96-segment cache. A seed repeats the route for the same generator version, not the outcome of your driving. The first version uses a 60 FPS runtime cap and a bounded 60 Hz simulation. The cap permits approximately 30 accepted frames per second on a 60 Hz browser host, because the existing runtime rounds its frame interval up to whole milliseconds; actual cadence depends on the device. Both are independent of the requested 50 ms sensor interval. There is no automatic neutral drift correction during a race.

This remains an experiment. Physical Telegram iOS/Android sensor timing, tilt-axis signs across grip positions, touch ergonomics and display latency still need device testing. Browser tests use real WASM and simulated Telegram sensor events; they do not establish phone sensor or display performance. Without Telegram DeviceOrientation the scene reports sensor unavailability and cannot finish calibration. There is no browser sensor fallback.

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

`main.js`, `main.css` and source maps are generated from `src/`. The loader and WASM are rebuilt Release artifacts containing the browser sample. `npm run build` verifies their recorded hashes first. Pages publishes the repository root with `.nojekyll`; no custom deployment workflow is required.

The build also updates JS/CSS cache keys in `index.html` and uses a shared key for the runtime loader and WASM. These keys take effect after loading the new HTML; an already open Mini App or cached HTML may still require a full reload.

If the pinned Playwright browser download is unavailable, an installed browser can be selected explicitly for an isolated headless test profile. Record the actual browser version with the results. For example, in PowerShell:

```powershell
$env:PORTALS_BROWSER_CHANNEL = 'chrome'
npm run test:browser
Remove-Item Env:PORTALS_BROWSER_CHANNEL
```

This setting does not use an existing interactive browser profile. Without it, Playwright uses its pinned Chromium download as before.

## Runtime source

[provenance.json](provenance.json) records the base commit and binary hashes. To rebuild the C++ runtime, check out Portals commit `080e5ea63bb813a97b996b156c7a5d9b5ee1d114`, apply [the runtime patch](source/portals-wasm-poc.patch), [the historical Run notification patch](source/browser-run-feedback.patch), [the gallery redesign patch](source/gallery-demo.patch), then [the application-switching and Level patch](source/apps-level.patch) and [the Moto patch](source/moto.patch). Activate Emscripten 6.0.12 with `EMSDK` set:

```sh
git apply /absolute/path/to/portals-wasm-poc.patch
git apply /absolute/path/to/browser-run-feedback.patch
git apply /absolute/path/to/gallery-demo.patch
git apply /absolute/path/to/apps-level.patch
git apply /absolute/path/to/moto.patch
cmake --preset wasm-release
cmake --build --preset wasm-release
```

The loader and WASM are produced under `build/wasm-release/wasm-gallery/`. The runtime uses native Wasm exceptions, without Asyncify, JSPI or pthreads. Replacing those artifacts here requires updating provenance hashes and repeating verification. The Moto patch also adds the finite `portals_moto_model_tests` target; build it in Debug/Release and run its generated JavaScript with Node to check calibration, control timing and the bounded route model.

The redesigned sample owns its animation in C++ through a cancellable scheduler scope. Stopping the scene cancels the timer before the sample state and terminal retire. The former `portalsRun` host callback is removed; the final patch supersedes that historical behavior. Native gallery sources and the fluent API are unchanged.

Portals documentation remains separate: https://ttldtor.github.io/portals/.

## Licenses

Portals and this host use [BSL-1.0](LICENSE.txt). Third-party notices and full licenses are included in `LICENSES.txt`, `PORTALS-LICENSE.txt`, `UTF8PROC-LICENSE.md`, `XTERM-LICENSE.txt` and `XTERM-FIT-LICENSE.txt`.
