# Changelog

All notable changes to YVZ Cards. Versions follow [semantic versioning](https://semver.org/).

## 0.7.1 — 2026-10-26

### Added

- Heating stats: a `compare` option (`same_time` or `full_day`). Today is now compared with yesterday up to the same time of day by default, and the subtitle says so ("compared with yesterday until 19:49").
- Heating stats: duty cycle under the runtime figure, a season line from `sensor.heating_pump_runtime_season` and `sensor.heating_pump_starts_season`, and the gap to the target for every room with the coldest room highlighted.
- Heating stats: tap a room, then tap again, to make it the leading room.
- Heating stats: long pump runs (30 minutes or more) as events, with dates and times. 8 events on wide cards, 5 otherwise.
- Heating stats: a "Collecting data (2 of 7 days)" note for 7 and 30 days on a new install.
- `note` on `yvz-stat`, and `display` and `partial` on the bars of `yvz-bars`.
- Playground: heating stats scenes for a wide panel, a frost target with a glitchy reading, a single active day and a new install, plus controls for them.

### Changed

- Heating stats: the timeline's scale now follows the room temperature, so a low target such as the frost temperature is clipped instead of flattening the line. Single glitchy readings are ignored in the chart, averages, minimums and maximums.
- Heating stats: the average heating rate comes from real warm-ups only (runs of at least 10 minutes where the room got warmer) instead of averaging the trend sensor. It shows a dash when there is none.
- Heating stats: the daily bars never scale below 2 hours, show the value above each bar, and hatch today. The average per day needs 3 finished days with history.
- Heating stats: two columns from 900 px card width.

## 0.7.0 — 2026-10-26

### Added

- **Heating stats card** (`custom:yvz-heating-stats-card`): how much the heating runs and how well it works, from the recorder's history, with no extra helpers.
  - Period switch for today, 7 days and 30 days, remembered per card. Four key figures (pump runtime, starts, average temperature, longest run) with the change against the previous period.
  - Run timeline with the pump on and off, the target and the room temperature. Daily runtime bars. A rooms table with lowest, highest and a trend per room, with the leading room marked.
  - Warm-up: average heating rate, the last warm-up and an estimate to the target. The last five mode changes and warnings.
  - Uses optional long-term sensors (`sensor.heating_pump_runtime_today` and friends, listed in the README) when they have a number as state, and falls back to the history otherwise. A start is each switch-on of the pump; an "on" already running when the period began isn't counted. With the yesterday sensors, Today is compared with all of yesterday. `compact` option, fills a panel view, visual editor, English, Dutch and Turkish.
- **Gauge card** (`custom:yvz-gauge-card`): any entity as a line, segmented or stat gauge, with warn and error thresholds, a target marker, an optional trend and tap and hold actions. Visual editor.
- A shared block layer (`src/blocks`) for building cards out of the same pieces: entity helpers, tap and hold actions and the gauge block.
- Design components: `yvz-stat` (a key figure with a change arrow), `yvz-bars` and `yvz-timeline`.
- `values`, `from` and `to` on `yvz-sparkline`, to draw data that is already loaded instead of fetching it.
- Playground: scenes for the heating stats and gauge cards, with a fake history for the stats.

## 0.6.3 — 2026-10-26

### Changed

- Tesla: the car only counts as driving when its gear is D, R or N and the gear or speed was reported in the last 5 minutes. Otherwise the card shows it as parked, with an "Old data" chip when the data is more than 3 hours old. Before, a last reading of "D" kept the car driving until it reported P.
- Playground: a control for how long ago the gear and speed were reported.

## 0.6.2 — 2026-10-26

### Changed

- Heating in a panel view: the dial, On/Off switch and presets stay together, centred, and the rooms are centred next to them. On wide cards (900px and up) the dial and room tiles get bigger.
- Tesla in a panel view: the car, battery and chips are one centred block, and so is the controls column. While driving, the car and speed sit side by side in one centred block instead of being stretched apart.
- Tesla controls go two across on narrow cards (under 430px), so tile labels are no longer cut off on a phone.

### Fixed

- Tesla: the wheels now spin around their centre while driving instead of wobbling.

### Added

- Playground: open a specific state from the URL, for example `?scene=Tesla&width=1100&height=800&s.shift=d&s.speed=108`.

## 0.6.1 — 2026-10-26

### Changed

- Cards now fill the height of a panel view instead of stopping at their content. In sections and masonry views nothing changes: the height still follows the content.
  - Heating: the dial stays centred between the header and the buttons.
  - Tesla: the car area grows and keeps the car centred; controls keep their size.
  - Stove: the power button and steppers are centred in the extra height.
  - Host: the sections share the extra height.
- Playground: a panel height slider to try the above.

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
