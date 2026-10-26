# YVZ Cards

Custom Home Assistant dashboard cards with one shared look: a stove remote, a server panel, a heating thermostat, heating statistics, a Tesla and a gauge for any entity. Every card has a visual editor and is translated into English, Dutch and Turkish; the language follows your Home Assistant profile.

| Card | Type | What it does |
|---|---|---|
| [Stove](#stove-card) | `custom:yvz-stove-card` | Status and remote for a (pellet) stove: power, temperature and fan steps |
| [Host](#host-card) | `custom:yvz-host-card` | Server panel: CPU, memory, temperatures, storage, network, details and a list of guests |
| [Heating](#heating-card) | `custom:yvz-heating-card` | Thermostat dial with on/off, Eco/Comfort/Boost and a room picker for the leading sensor |
| [Heating stats](#heating-stats-card) | `custom:yvz-heating-stats-card` | How much the heating runs and how well it works: runtime, starts, temperatures, warm-up and events |
| [Gauge](#gauge-card) | `custom:yvz-gauge-card` | One entity as a line, segmented or stat gauge, with colour thresholds and a trend |
| [Tesla](#tesla-card) | `custom:yvz-tesla-card` | Battery, range and charging, climate, charge limit and car controls, or a status-only compact card |

## Installation

### HACS

1. In HACS, open the menu → **Custom repositories**, add this repository's URL with type **Dashboard**.
2. Install **YVZ Cards** and reload the browser.

HACS adds the resource for you.

### Manual

1. Download `yvz-cards.js` from the latest [release](../../releases) and put it in `/config/www/`.
2. Under **Settings → Dashboards → Resources**, add `/local/yvz-cards.js` as a **JavaScript module**.

All cards are in that one file.

## Stove card

```yaml
type: custom:yvz-stove-card
name: Stove
status: input_select.stove_status
temperature: sensor.stove_temperature
power_sensor: sensor.stove_power
state_map:
  Uit: off
  Ontsteken: pending
  Brandt: on
  Uitdoven: standby
  Storing: error
actions:
  power: script.stove_power
  temp_up: script.stove_temp_up
  temp_down: script.stove_temp_down
  fan_up: script.stove_fan_up
  fan_down: script.stove_fan_down
```

| Option | Description |
|---|---|
| `name` | Card title. Default: "Stove". |
| `status` | `input_select`, `select` or `sensor` with the stove's state. |
| `state_map` | What each status value means: `off`, `pending` (igniting), `on` (burning), `standby` (cooling down) or `error`. Sets the colour of the power button and the status dot. Unmapped states use the accent colour. |
| `temperature` | Room temperature sensor, shown large in the header. |
| `power_sensor` | Power usage sensor in watts. Only used to spot a status that doesn't match the draw, see below. |
| `actions` | What each button triggers: a script, scene, button, input_button, switch or input_boolean. A row of − and + only shows when both its actions are set. |
| `compact` | One row: power, name, status, temperature and the temperature buttons. |

The stove is a remote: the commands go out over infrared and nothing comes back, so the card never shows a target temperature or fan level. After a tap the button flashes and the status line says what was sent ("Warmer sent") for 3 seconds. A second press of the same button within a second is ignored, so a double tap can't send two steps.

**Power:** one tap switches the stove on. While it is burning or igniting the first tap arms the button (red ring, "Tap again to turn off", gone after 3 seconds) and the second tap sends the command.

**The line under the controls** shows one thing, and nothing when there is nothing reliable to show. It works out ignition from the status history of the last 48 hours: the time between the start of Ontsteken (`pending`) and the start of the next Brandt (`on`).

| Status | Line |
|---|---|
| Off | "Last on: 18:42 to 21:35 · ignited in 9 min" |
| Igniting | "Usually takes 10 min", with a bar that fills towards the average |
| Burning | "Ignited in 9 min · avg 10 min", amber when the ignition took more than 1.5 times the average |
| Failed ignition (error right after igniting) | "No fire after 15 min · 1 failed today" |

The ignition parts are hidden when there was no igniting before the burning, when the run began before the available history, or when the history can't be loaded. If `power_sensor` shows real draw (more than `power_threshold`, default 150 W) while the status is off, or almost none while it burns, for more than 5 minutes, the line says "Status may be wrong: the plug draws 410 W" instead.

Optional extras, each hidden when not set:

| Option | Description |
|---|---|
| `ignition_avg` | Average ignition time today, in minutes. Without it the igniting bar assumes 10 minutes and a slow ignition isn't flagged. |
| `failures_today` | Failed ignitions today. |
| `trend`, `trend_off` | °C per hour while it burns, and while it is off or cooling down (shown as a drop). Shown under the room temperature. |
| `pellets_hours` | Hours of pellets left. A "Refill in 3 h" chip shows when it is at or below `pellets_threshold` (default 4). |
| `power_threshold` | Watts above which an off stove looks suspicious. Default 150. |

## Host card

```yaml
type: custom:yvz-host-card
name: pve
status: binary_sensor.pve_status
uptime: sensor.pve_uptime
cpu: sensor.pve_cpu_usage
memory: sensor.pve_memory_usage_percentage
trend: true
temperatures:
  - entity: sensor.pve_cpu_temperature
    name: CPU
disks:
  - entity: sensor.storage_local_usage_percentage
    name: local
network:
  down: sensor.pve_rx
  up: sensor.pve_tx
stats:
  - entity: sensor.pve_last_backup
    name: Last backup
guests:
  - prefix: jellyfin
    kind: container
```

| Option | Description |
|---|---|
| `name` | Card title. Default: "Server". |
| `status` | `binary_sensor` that is `on` while the host is online. |
| `uptime` | Timestamp sensor of the last boot; shown as a chip in the header. |
| `temperature` | Temperature for a header chip. Hidden when the same sensor is also in `temperatures`. |
| `cpu`, `memory` | Usage sensors in %. Warn at 70 %, error at 90 %. |
| `temperatures` | List of sensors (see below). Default thresholds 70 / 85 °C, converted when the sensor reports °F. |
| `disks` | List of usage sensors (see below). Default thresholds 80 / 95 %. |
| `network` | `down` and `up` rate sensors. |
| `disk_io` | `read` and `write` rate sensors. |
| `stats` | Any other entities for the Details section (see below). Timestamps show as "… ago", problem sensors as OK / Problem. |
| `guests` | VMs, containers or services (see below). |
| `trend` | Show a history line under each gauge and rate. Default: `false`. |
| `trend_hours` | Hours of history for the trends. Default: `24`. |
| `columns` | Fixed column count. Default: automatic, 1 to 4 depending on the card's width. Never narrower than 150 px per cell. |
| `compact` | Tighter spacing, no trends, CPU and memory move into the header. |

**Sensor items** (`temperatures`, `disks`, `stats`): `entity` (required), `name`, `warn_at`, `error_at`, and for stats also `icon`. Without an icon, stats pick one from the device class or unit.

**Guests**: `name`, `kind` (`vm` or `container`, picks the icon), `icon`, and either a `prefix` or the entities themselves. A prefix fills in entities that follow this naming; set any of them directly to override it:

| Field | From `prefix: jellyfin` |
|---|---|
| `status` | `binary_sensor.jellyfin_status` |
| `cpu` | `sensor.jellyfin_cpu_usage` |
| `memory` | `sensor.jellyfin_memory_usage_percentage` |
| `disk` | `sensor.jellyfin_disk_usage` |
| `uptime` | `sensor.jellyfin_uptime` |

## Heating card

```yaml
type: custom:yvz-heating-card
```

The card is built for a heating package with a `generic_thermostat`, a mode selector and a few helpers. With entities named as below it needs no configuration at all. Any entity can be overridden in the visual editor or in YAML.

| Option | Default | Used for |
|---|---|---|
| `climate` | `climate.heating` | Target temperature and the dial's range and step |
| `mode` | `input_select.heating_mode` | Options `Off`, `On`, `Eco`, `Comfort`, `Boost` |
| `target` | `input_number.heating_target_temp` | Manual target; −/+ write here and switch to `On` |
| `comfort` | `input_number.heating_comfort_temp` | Comfort temperature (settings) |
| `eco` | `input_number.heating_eco_temp` | Eco temperature (settings) |
| `boost_minutes` | `input_number.heating_boost_minutes` | Boost duration (settings) |
| `boost_timer` | `timer.heating_boost` | Boost countdown and progress |
| `before_boost` | `input_text.heating_mode_before_boost` | Mode to return to when Boost is cancelled |
| `frost_enabled` | `input_boolean.heating_frost_enabled` | Frost protection on/off (settings) |
| `frost_temp` | `input_number.heating_frost_temp` | Frost temperature; rooms at or below it get a snowflake |
| `sensors` | `sensor.heating_sensors` | Attribute `map`: room name → temperature entity |
| `leading` | `input_select.heating_leading_sensor` | The room the thermostat follows |
| `control` | `sensor.heating_control_temperature` | Current temperature on the dial |
| `trend` | `sensor.heating_trend` | °C per hour; shown as rising / falling / steady |
| `pump` | `binary_sensor.heating_pump` | Pump state and how long it has been on |
| `offline` | `binary_sensor.heating_offline` | Offline banner; disables the controls |
| `no_warmup` | `binary_sensor.heating_no_warm_up` | Warning banner |
| `sensor_problem` | `binary_sensor.heating_sensor_problem` | Warning banner |
| `battery_low` | `binary_sensor.heating_sensor_battery_low` | Banner and battery icons; attribute `low_sensors` lists entries like `Kelder (2.1 V)` |

Other options: `name` (default "Heating") and `compact` (smaller dial and controls).

How it works:

- **−/+** step the target and switch to `On`. Hold to keep stepping. Changes are sent after a short pause, so several taps become one update.
- **On / Off** sets the mode. On only does something when the heating is off.
- **Eco / Comfort / Boost** set the mode. Tap an active Boost to cancel it and return to the previous mode.
- **Rooms**: tap a room to make it the leading sensor.
- **Settings** (cog): comfort, eco, boost duration and frost protection.

> **Upgrading from the old standalone heating card:** remove its `yvz-heating-card.js` resource first. Both register the same card name, and if the old one loads first the whole YVZ Cards bundle fails to load.

## Heating stats card

```yaml
type: custom:yvz-heating-stats-card
```

Statistics for the heating package behind the heating card. With the same entity names it needs no configuration, and it needs no helpers either: the numbers come from the recorder's history, which is fetched once and refreshed every 5 minutes and whenever the pump switches.

| Option | Default | Description |
|---|---|---|
| `name` | "Heating stats" | Card title. |
| `compact` | `false` | Only the key figures and the daily bars. |
| `period` | `today` | Period shown first: `today`, `week` or `month`. The one you pick is remembered per card, in this browser. |
| `compare` | `same_time` | What Today is compared with: `same_time` (yesterday up to the same time of day) or `full_day` (all of yesterday). The subtitle says which. |
| `pump`, `climate`, `control`, `trend`, `mode`, `sensors`, `leading` | as in `heating.yaml` | Entities the card reads. |
| `offline`, `no_warmup`, `sensor_problem`, `battery_low` | as in `heating.yaml` | Warning sensors, shown as events. |
| `runtime_today`, `runtime_yesterday`, `runtime_week`, `runtime_month`, `runtime_season`, `starts_…` | `sensor.heating_pump_runtime_today` … | Optional long-term sensors, see [Optional helpers](#optional-helpers). |

- **Key figures** for pump runtime, number of starts, average room temperature and longest run, each with an arrow showing the change against the previous period. Under the runtime is the duty cycle: the share of the elapsed time the pump ran.
- **Run timeline:** when the pump ran, with the room temperature and the target (dashed) on top. The scale follows the room temperature, so a low target such as the frost temperature doesn't flatten the line; it is clipped instead. Short glitches are ignored everywhere: a single reading that jumps more than 3° away from both neighbours, or a dip and rebound of up to 5 minutes that ends back near where it started. The target is left out on 30 days, because the thermostat's history is heavy.
- **Daily bars:** pump runtime per day for 7 or 30 days, with the value above each bar. The scale is at least 1 hour, and today is hatched because it isn't over. The average per day only shows once 3 finished days have history.
- **Rooms:** now, the gap to the target, lowest and highest in the period, and a small trend. The coldest room gets a snowflake and its gap in the accent colour, and the leading room is marked. Tap a room, then tap again to make it the leading room.
- **Warm-up:** the average heating rate is worked out from real warm-ups only: runs of at least 10 minutes where the room got warmer, using the room temperature at the start and end of each run. It shows a dash when there is none. Also the last warm-up (from → to, minutes) and an estimate to the target, which only shows while the pump runs and the room is warming.
- **Events:** the last 5 (8 on wide cards) mode changes, warnings and long pump runs (30 minutes or more), with their date and time.
- **Season:** a line with the season's runtime and starts, when those sensors exist.
- **New installs:** with fewer than 3 days of history, 7 and 30 days show "Collecting data (2 of 7 days)" and keep the figures.
- Two columns from 900 px card width, based on the card itself, not the screen. Fills the height of a panel view, and has no editing controls.

### Optional helpers

The card works without these. When they exist and have a number as state, the card uses them for the headline pump runtime and number of starts, which is cheaper and survives a short recorder history. Otherwise it works the numbers out from history. For 7 and 30 days the change against the previous period always comes from history, because these sensors only cover the current window.

| Entity | Type | Window | Used for |
|---|---|---|---|
| `sensor.heating_pump_runtime_today` | time (hours) | since midnight | Runtime, Today |
| `sensor.heating_pump_runtime_yesterday` | time (hours) | all of yesterday | Runtime change for Today |
| `sensor.heating_pump_runtime_week` | time (hours) | rolling 7 days | Runtime, 7 days |
| `sensor.heating_pump_runtime_month` | time (hours) | rolling 30 days | Runtime, 30 days |
| `sensor.heating_pump_starts_today` | count | since midnight | Starts, Today |
| `sensor.heating_pump_starts_yesterday` | count | all of yesterday | Starts change for Today |
| `sensor.heating_pump_starts_week` | count | rolling 7 days | Starts, 7 days |
| `sensor.heating_pump_starts_month` | count | rolling 30 days | Starts, 30 days |
| `sensor.heating_pump_runtime_season` | time (hours) | since the most recent 1 October | Season line |
| `sensor.heating_pump_starts_season` | count | since the most recent 1 October | Season line |

With `compare: full_day`, Today is compared with all of yesterday and uses the yesterday sensors; by default it compares with yesterday up to the same time of day, from history, so the arrows aren't skewed early in the day. The season sensors only feed the footer line, and the line is hidden when they are unavailable.

A **start** is each time the pump switches on. An "on" that was already running when the period began doesn't count, with the sensors or without them.

Create each one in Home Assistant under **Settings → Devices & services → Helpers → Create helper → Statistics (history stats)**:

1. **Entity:** `binary_sensor.heating_pump`, **State:** `on`.
2. **Type:** `time` for runtime, `count` for starts.
3. **Start and end** of the window:

| Window | Start | End |
|---|---|---|
| Today | `{{ now().replace(hour=0, minute=0, second=0) }}` | `{{ now() }}` |
| Yesterday | `{{ now().replace(hour=0, minute=0, second=0) - timedelta(days=1) }}` | `{{ now().replace(hour=0, minute=0, second=0) }}` |
| 7 days | `{{ now() - timedelta(days=7) }}` | `{{ now() }}` |
| 30 days | `{{ now() - timedelta(days=30) }}` | `{{ now() }}` |
| Season | `{{ now().replace(month=10, day=1, hour=0, minute=0, second=0) if now().month >= 10 else now().replace(year=now().year - 1, month=10, day=1, hour=0, minute=0, second=0) }}` | `{{ now() }}` |

4. Name each one so it gets the entity id above, for example "Heating pump runtime today".

## Gauge card

```yaml
type: custom:yvz-gauge-card
entity: sensor.cpu_usage
warn_at: 70
error_at: 90
trend: true
```

| Option | Default | Description |
|---|---|---|
| `entity` | | The entity to show. |
| `name`, `icon`, `unit` | from the entity | Label, icon and unit. |
| `variant` | `line` | `line`, `segments` or `stat` (number only). |
| `min`, `max` | `0`, `100` | Range of the gauge. |
| `warn_at`, `error_at` | | Colour turns amber and red from these values. |
| `invert` | `false` | Low values are the bad ones, for example a battery. |
| `target` | | A marker: a number, or another entity whose state is the target. |
| `decimals` | automatic | Decimals shown. |
| `trend`, `trend_hours` | `false`, `24` | A trend line under the gauge. |
| `tap_action`, `hold_action` | more-info, none | `more-info`, `toggle`, `call-service`, `navigate`, `url` or `none`. |

## Tesla card

```yaml
type: custom:yvz-tesla-card
device_id: 5116023991b66b7416e685dff829941f
```

For the **Tesla Fleet** and **Teslemetry** integrations. Pick your car and every entity is found automatically by its translation key; without `device_id` the first Tesla with a battery sensor is used.

| Option | Default | Description |
|---|---|---|
| `device_id` | first Tesla found | The car. |
| `name` | device name | Card title. |
| `compact` | `false` | Status only: car, battery, range, charging and quick-glance chips. No climate, charge limit or controls. |
| `paint` | `stealth_grey` | `stealth_grey`, `pearl_white`, `quicksilver`, `diamond_black`, `ultra_red`, `deep_blue` or `custom`. |
| `paint_rgb` | | `[r, g, b]`, for `paint: custom`. |
| `controls` | lock, defrost, seats, steering, sentry, charge port, frunk, trunk, flash | Tiles to show: `defrost`, `seat_left`, `seat_right`, `steering`, `charge_switch`, `charge_port`, `lock`, `sentry`, `frunk`, `trunk`, `windows`, `flash`, `honk`, `wake`. |
| `show_climate` | `true` | Climate on/off and target temperature. |
| `show_charge_limit` | `true` | Charge limit slider. |
| `entities` | | Override any entity found automatically, by key (see the visual editor). |
| `prefix` | | Legacy fallback: builds ids like `sensor.model_3_battery_level`. |

- The battery line turns green and pulses while charging, solid green when complete, amber when plugged in but not charging below the limit, and red when the charger has no power. The marker on the line is the charge limit.
- The car shows what is going on: lids and windows opening, the cable with current flowing while charging, an orange glow and rising heat with the climate on, wisps on the windows while defrosting, "z"s while asleep, blinking lights when it locks or unlocks.
- Chips sit under the battery in one line of fixed height: what the car is doing (parked, driving, asleep), plus anything unlocked, open, a tyre warning, an update or sentry. Locked and the inside temperature are in the subtitle.
- Controls are grouped into Climate, Charging, Security and Actions. Heaters show their level as dots. Lock, frunk, trunk, charge port, windows and honk need a second tap to confirm.
- Hold −/+ to keep stepping the target temperature; several taps are sent as one command.
- **Settings** (cog): choose which controls and panels show. Saved in this browser only, and overrides `controls` until you reset it.
- While driving, the card shows speed and gear and hides climate and controls.
- Tap the car while it is asleep, twice, to wake it. A banner warns when the car's data is more than three hours old.

## Panel view

Put a card alone in a `type: panel` view and it fills the whole height, with the extra space going to its main part (the dial, the car) rather than to blank space at the bottom. In sections and masonry views the card stays as tall as its content, as before.

## Colours

The cards colour themselves by state. You can override any state colour in your theme or with card-mod:

```yaml
--yvz-on-color: "#5cc98a"
--yvz-standby-color: "#4f8fe8"
--yvz-pending-color: "#f5a623"
--yvz-heat-color: "#ff7a45"
--yvz-error-color: "#e0434f"
--yvz-off-color: "#6b7280"
```

## Development

```sh
npm install
npm run playground   # cards with fake Home Assistant states, at http://localhost:5173
npm run dev          # rebuild dist/yvz-cards.js on every change
npm run build        # type-check and build
```

The playground has a scene per card with controls for every state, a light and dark theme, a language switch, a width slider and a switch that makes service calls fail.

Publishing a GitHub release builds `yvz-cards.js` and attaches it to the release, which is what HACS installs. See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.
