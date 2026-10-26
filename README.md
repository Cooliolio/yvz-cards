# YVZ Cards

Custom Home Assistant dashboard cards with one shared look: a stove remote, a server panel, a heating thermostat and a Tesla. Every card has a visual editor and is translated into English, Dutch and Turkish; the language follows your Home Assistant profile.

| Card | Type | What it does |
|---|---|---|
| [Stove](#stove-card) | `custom:yvz-stove-card` | Status and remote for a (pellet) stove: power, temperature and fan steps |
| [Host](#host-card) | `custom:yvz-host-card` | Server panel: CPU, memory, temperatures, storage, network, details and a list of guests |
| [Heating](#heating-card) | `custom:yvz-heating-card` | Thermostat dial with on/off, Eco/Comfort/Boost and a room picker for the leading sensor |
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
| `state_map` | What each status value means: `off`, `pending`, `on`, `standby` or `error`. Sets the colour and the confirm question. Unmapped states use the accent colour. |
| `temperature` | Temperature sensor, shown in the header. |
| `power_sensor` | Power usage sensor, shown next to the status while the stove runs. |
| `actions` | What each button triggers: a script, scene, button, input_button, switch or input_boolean. `power` asks for a second tap to confirm. A stepper only shows when both its up and down actions are set. |

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
