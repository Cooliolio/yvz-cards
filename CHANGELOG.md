# Changelog

All notable changes to YVZ Cards. Versions follow [semantic versioning](https://semver.org/).

## 0.6.0 — 2026-10-26

### Added

- **Tesla card** (`custom:yvz-tesla-card`), rebuilt from the standalone Tesla Hub card on the shared design system, for Tesla Fleet and Teslemetry.
  - Car in your paint colour that shows its state: lids and windows opening, the charge cable with current flowing, sentry, spinning wheels and wind while driving, an orange glow and rising heat with the climate on, wisps on the windows while defrosting, "z"s while asleep, and blinking lights when it locks, unlocks or flashes.
  - Battery line with the charge limit as a marker. Charging pulses green, complete is solid green, plugged in but not charging is amber while below the limit, and no power at the charger is red. Charging shows power, finish time and energy added.
  - Climate on/off with target temperature (hold −/+ to keep stepping), a charge limit slider, and grouped control tiles (Climate, Charging, Security, Actions). Heater levels are dots. Risky controls need a second tap.
  - Chips in one fixed-height line under the battery, so nothing moves when they change. Locked and the inside temperature are in the subtitle.
  - Settings view behind the cog to choose which controls and panels show, stored per browser.
  - `compact` option: status only, with no controls.
  - Driving view with speed and gear. Banner when the car's data is old. Tap the sleeping car twice to wake it.
  - Visual editor, entities found automatically from the chosen car, English, Dutch and Turkish.
- Design components: `yvz-slider`.
- `heat` state colour (`--yvz-heat-color`, orange) for active heating and warming.
- `steps` and `level` on `yvz-tile`, to show a level as dots.
- `pulse` and `done` options on `yvz-gauge` for a filling or finished state.
- `repeat` option on `yvz-stepper`: hold − or + to keep stepping. The heating settings use it.
- `--yvz-tile-padding`, `--yvz-tile-value-size` and `--yvz-tile-value-line` on `yvz-tile`, for smaller tiles.
- Playground: a Tesla scene with the compact card underneath, scenes can now show extra cards, and the gallery shows the slider and the new gauge states.

### Changed

- The heating card's settings view now shares its slide and height animation with the Tesla card.

## 0.5.0 — 2026-10-26

### Added

- **Heating card** (`custom:yvz-heating-card`), rebuilt from the standalone heating card on the shared design system.
  - Thin 240° dial with the current temperature as fill and the target as a dot; −/+ sit on the dial next to the cold and warm ends. Hold −/+ to keep stepping.
  - Target shown as large whole degrees with smaller raised decimals; a faint glow in the state colour behind the dial.
  - On/Off toggle, and Eco, Comfort and Boost with their temperature or duration. Boost shows minutes left and a draining bar; tap it again to cancel.
  - Rooms as a grid of tiles. Tap one to make it the leading sensor. Tiles show a snowflake at or below the frost temperature, a battery icon when low, and fade when the sensor isn't reporting.
  - Banners for offline, no warm-up, sensor problem and low battery. The header shows how long the pump has been on.
  - Settings view behind the cog: comfort, eco, boost duration and frost protection.
  - Works without configuration; every entity can be overridden. Visual editor with grouped entity pickers, plus a `compact` option.
  - Animations for the dial on load, switching on and off, and switching to settings and back. Haptic feedback in the Home Assistant app.
- Design components: `yvz-dial`, `yvz-tile`, `yvz-segmented` (with a sliding highlight), `yvz-banner`, `yvz-icon-button` (plain or raised, with hold-to-repeat), `yvz-section-title` and `yvz-setting-row`.
- `outline` option on `yvz-button`, `yvz-segmented` and `yvz-tile`; `progress` bar on `yvz-button`.
- `--yvz-press-scale` token, so everything tappable shrinks the same amount when pressed.
- Playground: a Heating scene whose buttons change the fake state, like the real automations would.

### Changed

- The stove card's power button now uses the shared press-scale token, so it shrinks very slightly less when pressed.

## 0.4.0 — 2026-10-25

### Added

- Host card: `columns` option and automatic column count (1 to 4) based on the card's width. Sections share a row when they fit; the guest list splits in two on wide cards.
- Host card: `compact` option, with CPU and memory as header chips.
- Host card: captions on every section, with the trend window shown next to sections that have trends.
- Host card: icons in the Details section, picked from the device class or unit, or set with `icon`. Problem sensors show OK / Problem.
- Host card: inline usage bars in the guest list, and `kind` (`vm` / `container`) and `icon` options for guests.
- Gauges show where the warning and error ranges start, and numbers animate to new values.
- Sparklines: two series mirrored around a midline, a tint when the value is in warning or error, and a tooltip with time and value on hover.

### Changed

- Gauge bars are neutral while healthy and only take a colour in the warning or error range.
- Rate values move below the label when the cell is narrow, instead of cutting the label off. With trends on, one combined trend replaces the separate bars and lines.
- The header temperature chip is hidden when the same sensor already has its own cell.
- The host card estimates its height from its content.

## 0.3.0 — 2026-10-25

### Added

- Host card: Details section for any extra entities.
- Host card: `trend_hours` option for the trend window.
- Host card: trends for network and disk I/O.

## 0.2.0 — 2026-10-25

### Added

- **Host card** (`custom:yvz-host-card`) with visual editor.
- Design components: gauge, rate, stack and sparkline.
- Local playground with fake Home Assistant states.

## 0.1.0 — 2026-10-25

### Added

- **Stove card** (`custom:yvz-stove-card`) with visual editor.
- Shared design system, helpers and English, Dutch and Turkish translations.
- Build check on every push and a release workflow that attaches `yvz-cards.js`.
