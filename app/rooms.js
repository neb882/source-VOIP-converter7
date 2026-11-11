/* TF2 Voice Emulator, app/rooms.js: the listener's room on the page (order W3-17, part d).
 * One of the page scripts that were script.js, loaded in order by
 * index.html (core, rooms, console, source, render, meter, realtake,
 * visualizer, netgraph, boot); they share their top-level names.
 *
 * The listener position's choices (built here from LISTENER_POSITIONS and
 * room-dsp.js's cases and places), the manual number and the automatic
 * room's six measures, under water, the lines under them, what a render is
 * asked for (roomSettings) and how settings made before W3-17d land on the
 * new controls (migrateRoomConfig). */

/* ------------------------------------------------------------------ */
/* The choices                                                        */
/* ------------------------------------------------------------------ */

// The line under the listener position whenever a room or under water is
// chosen: what the recordings show (finding 32, and the order's amendment
// after Sets K and L).
const ROOM_EVIDENCE = 'Room effects follow the game\'s own code. The two rooms marked "as recorded" match recordings of the game '
  + 'in echo times and level, and room 6 matches a recording echo by echo. The 2Fort places use the measures the game printed there; '
  + 'the other shapes are examples. No room has been checked sample for sample yet.';
// The custom room (dsp_room 99) is the app's own: no line claims the game's code for it.
const CUSTOM_EVIDENCE = 'The custom room is the app\'s own, not the game\'s: no recording can check it.';
const WATER_EVIDENCE = 'Read from the game\'s code. One recording under water matches its level (0.77 of the dry voice) and its lack of tremolo.';

const ROOM_GROUPS = [
  ['recorded', 'Automatic room, as recorded'],
  ['example', 'Automatic room: examples by shape'],
  ['place', 'Automatic room: places measured on 2Fort'],
  ['number', 'A room the map sets by number']
];

// The row of room-dsp.js a place of the page builds from (a case or a place).
// The room's share of 256 for a preset number of the table.
const roomShare = (n) => TF2Room.shares(TF2Room.presetOf(n, TF2_ROOM_PRESETS)).room;

const roomRow = (key) => {
  const p = LISTENER_POSITIONS[key];
  return p && p.room && typeof p.room.auto === 'string' ? TF2Room.roomCase(p.room.auto) : null;
};

function positionLabel(key) {
  const p = LISTENER_POSITIONS[key], row = roomRow(key);
  return p.label || (row ? row.label : key);
}

// The listener position's options, in the order's order: no room, the
// automatic rooms (as recorded, examples, places), the numbered rooms,
// manual. Its first choice is DEFAULT_LISTENER.
function buildListenerOptions() {
  const select = els.position;
  const option = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
  const keys = Object.keys(LISTENER_POSITIONS).filter((k) => !LISTENER_POSITIONS[k].legacy);
  const parts = keys.filter((k) => LISTENER_POSITIONS[k].group === 'none').map((k) => option(k, positionLabel(k)));
  for (const [group, label] of ROOM_GROUPS) {
    const g = document.createElement('optgroup');
    g.label = label;
    g.append(...keys.filter((k) => LISTENER_POSITIONS[k].group === group).map((k) => option(k, positionLabel(k))));
    if (g.children.length) parts.push(g);
  }
  parts.push(option('manual', 'Manual: number or measures below'));
  select.replaceChildren(...parts);
  select.value = DEFAULT_LISTENER;
}

// The manual number's options: the game's 0 to 29 and the app's 99.
function buildEnvOptions() {
  const select = els.env;
  select.replaceChildren(...Object.keys(DSP_PRESETS).map(Number).sort((a, b) => a - b).map((n) => {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = `${n}: ${DSP_PRESETS[n].name}`;
    return o;
  }));
  select.value = '0';
}

// A typed dsp_room the select does not offer (any whole number): an option
// of its own, so the control can hold it. One the table does not hold gives
// no room in a render (Decision 11); the app does not have that room.
function envOption(n) {
  const value = String(n);
  if ([...els.env.options].some((o) => o.value === value)) return value;
  const held = !!TF2Room.presetOf(n, TF2_ROOM_PRESETS);
  const o = document.createElement('option');
  o.value = value;
  o.dataset.typed = '1';
  o.textContent = held ? `${n}: a preset of the game's file (typed)` : `${n}: the app does not have this room`;
  els.env.append(o);
  return value;
}

/* ------------------------------------------------------------------ */
/* What a render is asked for                                         */
/* ------------------------------------------------------------------ */

const wholeOf = (el, fallback) => { const v = Math.round(Number(el.value)); return Number.isFinite(v) ? Math.max(0, v) : fallback; };

// The six measures of the manual automatic room, as room-dsp.js takes them.
function manualMeasures() {
  const refl = Number(els.autoRefl.value);
  return { sky: !!els.autoSky.checked, width: wholeOf(els.autoWidth, 300), length: wholeOf(els.autoLength, 400),
    height: wholeOf(els.autoHeight, 160), reflectivity: Number.isFinite(refl) ? Math.min(1, Math.max(0, refl)) : 0.4,
    openSides: Math.min(4, wholeOf(els.autoOpen, 0)) };
}

// { room, underwater } for audio.js: room is null (no room), { auto: key or
// measures }, { preset: n } or { custom: knobs }.
function roomSettings() {
  const key = els.position.value, underwater = !!(els.underwater && els.underwater.checked);
  if (key !== 'manual') {
    const p = LISTENER_POSITIONS[key];
    return { room: p && p.room ? { ...p.room } : null, underwater };
  }
  const n = parseInt(els.env.value, 10);
  if (!Number.isInteger(n) || n === 0) return { room: null, underwater };
  if (n === 1) return { room: { auto: manualMeasures() }, underwater };
  if (n === 99) return { room: { custom: { duration: Number(els.cDur.value), decay: Number(els.cDec.value), mix: Number(els.cMix.value) / 100 } }, underwater };
  return { room: { preset: n }, underwater };
}

// What the engine would build for the room asked, in words: "tunnel; size
// class 2; from presets 114 and 115; 72/256 to the room".
function describeBuild(b) {
  return `${b.shaft ? 'vertical shaft, ' : ''}${b.shape}; size class ${b.classes.size}; from presets ${b.pair[0]} and ${b.pair[1]}; `
    + `${TF2Room.shares(b.preset).room}/256 to the room`;
}

function describeMeasures(m) {
  return `${m.sky ? 'under the sky' : 'indoors'}, ${m.width} × ${m.length} × ${m.height} units, reflectivity ${m.reflectivity}`
    + `${m.sky && m.openSides ? `, ${m.openSides} open side${m.openSides === 1 ? '' : 's'}` : ''}`;
}

// A short name for the room asked, for the chain strip and the console.
function roomSummary() {
  const { room, underwater } = roomSettings();
  let text = 'no room';
  try {
    if (room && room.auto !== undefined) {
      const b = TF2Room.buildAutomatic(room.auto, { table: TF2_ROOM_PRESETS });
      text = `${typeof room.auto === 'string' ? positionLabel(els.position.value) : 'automatic room'} · ${TF2Room.shares(b.preset).room}/256 to the room`;
    } else if (room && room.preset !== undefined) {
      text = TF2Room.presetOf(room.preset, TF2_ROOM_PRESETS) ? `dsp_room ${room.preset} · ${roomShare(room.preset)}/256 to the room`
        : `dsp_room ${room.preset}: not in the app, no room`;
    } else if (room && room.custom) text = `custom room (not the game's) · ${Math.trunc(room.custom.mix * 256)}/256`;
  } catch (e) { text = 'room: the measures do not build'; }
  return `${text}${underwater ? ' · under water' : ''}`;
}

/* ------------------------------------------------------------------ */
/* The lines under the controls                                       */
/* ------------------------------------------------------------------ */

function positionDetail(key) {
  const p = LISTENER_POSITIONS[key];
  if (key === 'manual') return 'The number, or the automatic room\'s measures, in the advanced controls (Listener room & output).';
  if (!p || !p.room) return `${p ? p.variable : 'dsp_slow_cpu 1'}: the game's lowest Sound quality turns rooms off. No room is what Set B shows.`;
  if (p.room.preset !== undefined) {
    return `The map's soundscape sets dsp_room ${p.room.preset} (${DSP_PRESETS[p.room.preset].name}): `
      + `${roomShare(p.room.preset)}/256 of the voice to the room.`;
  }
  const row = roomRow(key), b = TF2Room.buildAutomatic(p.room.auto, { table: TF2_ROOM_PRESETS });
  const where = row.map ? `Measured by the game on ${row.map}, ${row.spot}: ` : row.measured ? 'Measures: ' : 'An example: ';
  return `${where}${describeMeasures(row.measures)}. The engine builds: ${describeBuild(b)}.${row.note ? ` ${row.note}` : ''}`;
}

function envDetail() {
  const n = parseInt(els.env.value, 10);
  if (n === 1) {
    try { return `The engine would build: ${describeBuild(TF2Room.buildAutomatic(manualMeasures(), { table: TF2_ROOM_PRESETS }))}.`; }
    catch (e) { return `These measures do not build a room: ${e.message}`; }
  }
  if (n === 0) return 'dsp_room 0: no room, as when no soundscape has set one.';
  if (n === 99) return 'The app\'s own room, not the game\'s: its three knobs are under Extras.';
  if (!TF2Room.presetOf(n, TF2_ROOM_PRESETS)) return `dsp_room ${n}: the app does not have this room. A render has none; the live monitor keeps the room it had.`;
  return `Preset ${n}: ${roomShare(n)}/256 of the voice to the room.`;
}

// The lines, and which manual panels show, for the controls as they stand.
function updateRoomControls() {
  const key = els.position.value, n = parseInt(els.env.value, 10);
  const detail = document.getElementById('room-detail'), evidence = document.getElementById('room-evidence');
  const envLine = document.getElementById('env-detail');
  if (detail) detail.textContent = positionDetail(key);
  if (envLine) envLine.textContent = envDetail();
  if (els.autoEnv) els.autoEnv.style.display = n === 1 ? 'block' : 'none';
  if (els.customEnv) els.customEnv.style.display = n === 99 ? 'block' : 'none';
  if (evidence) {
    const line = evidenceLine();
    // Hidden, the line is emptied and left out of the control's description,
    // so a screen reader does not read it either.
    evidence.hidden = !line;
    evidence.textContent = line;
    els.position.setAttribute('aria-describedby', line ? 'room-detail room-evidence' : 'room-detail');
  }
}

// The line on what the recordings show, for the room and the water asked:
// the game's rooms' line for a room the render runs; the custom room's own;
// none for a number that renders no room (or a custom room at mix 0); the
// water's line under water with no room.
function evidenceLine() {
  const { room, underwater } = roomSettings();
  let line = '';
  if (room && room.custom) line = Math.trunc(room.custom.mix * 256) > 0 ? CUSTOM_EVIDENCE : '';
  else if (room && room.preset !== undefined) line = TF2Room.presetOf(room.preset, TF2_ROOM_PRESETS) ? ROOM_EVIDENCE : '';
  else if (room) line = ROOM_EVIDENCE;
  if (underwater) line = line ? `${line} Under water: ${WATER_EVIDENCE.charAt(0).toLowerCase()}${WATER_EVIDENCE.slice(1)}` : WATER_EVIDENCE;
  return line;
}

/* ------------------------------------------------------------------ */
/* Settings made before W3-17d                                        */
/* ------------------------------------------------------------------ */

// A share link's or saved setting's `pos` from before W3-17d lands on the new
// controls (part d, item 3): the eight rooms become manual with the number
// each stood for; `water` becomes no room under water. Returns a new config,
// or the same one. A full config without `uw` (one made before under water
// was a control of its own) is not under water.
function migrateRoomConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || cfg.pos == null) return cfg;
  const old = LISTENER_POSITIONS[String(cfg.pos)];
  const out = { ...cfg };
  if (old && old.legacy) {
    if (cfg.pos === 'water') { out.pos = 'open'; out.uw = '1'; }
    else { out.pos = 'manual'; out.dsp = String(old.dsp); }
  }
  // dsp_room 1 with none of the six measures is a setting made before
  // W3-17d, when 1 rendered no room: it renders none still. A setting made
  // since carries its measures.
  if (String(out.pos) === 'manual' && String(out.dsp).trim() === '1' && ['asky', 'aw', 'al', 'ah', 'aopen', 'arefl'].every((k) => cfg[k] == null)) {
    out.pos = 'open';
  }
  if (out.uw == null) out.uw = '0';
  return out;
}

buildListenerOptions();
buildEnvOptions();
