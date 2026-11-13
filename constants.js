/* =========================================================================
 * TF2 Voice Emulator — constants.js
 *
 * Data-only module. Exposes globals for other scripts to consume:
 *   TF2_DATA           — names, weapons, chat lines, errors, system, achievements
 *   PRESETS            — quick processing presets (modern / legacy / spam ...)
 *   CODEC_PROFILES     — real libopus configurations for each voice codec
 *   VOICE_ENGINE       — receiver-side voice path (auto-gain, mixer, output)
 *   DSP_PRESETS        — the names of dsp_room 0-29 (and the app's 99); their
 *                        numbers are in room-presets.js (order W3-17)
 *   DEFAULT_LISTENER   — the listener's first place: no room
 *   LISTENER_POSITIONS — the page's listener places, each a room for audio.js
 *   ROOM_NUMBERS       — the numbered rooms the soundscape scripts ask for
 *   FCVAR              — Source cvar flag bits
 *
 * References:
 *   - Valve dsp_presets.txt (via the Facepunch garrysmod mirror): where the
 *     numbers of presets 0 to 29 were first taken from; room-presets.js now
 *     holds the game's own file's numbers.
 *   - zhenyangli.me "Reversing Steam Voice Codec" — Steam voice is Opus at
 *     24 kHz mono.
 *   - tests/REFERENCE_2026.md — paired loopback and test-signal measurements
 *     behind the Steam profile and VOICE_ENGINE values.
 * ========================================================================= */

const TF2_DATA = {
  playerNames: [
    "teapot_lid", "gravel_path", "pinecone42", "LampShade", "soggy_waffle",
    "Kettle Drum", "bucket_of_bolts", "Paperclip31",
    "quiet_moth", "Doorknob", "RustyHinge", "corn_on_cob",
    "TinCanPhone", "mossy_rock", "Spoon Thief",
    "pickle_jar", "Lantern9", "hat_rack", "cardboard_tube", "sock_drawer",
    "velvet_toad", "Umbrella Stand", "gumdrop77", "HalfToaster", "wet_matches",
    "Clothespin", "lint_roller", "barnacle_jar", "big_ladle",
    "Muffin Tin", "snowglobe5", "cactus_hugger", "Old Tire",
    "wobbly_chair", "Sandpaper", "unnamed", "thimble", "PotatoClock",
    "Stapler Jr", "birdbath", "Fence Post", "noodle_strainer", "CopperPot",
    "rainboot", "Garden Hose", "toothpick99", "bathtub_duck",
    "Brick Wall", "MarbleBag", "sleepy_owl", "PlankOfWood", "jam_jar_9",
    "Coat Hook", "tumbleweed", "Spy", "Sniper", "Demoman",
    "Lighthouse_Lamp", "puddle_jumper", "Haystack", "bent_fork",
    "Teacup Pilot", "walnut_shell", "OvenMitt", "Chalkboard",
    "lost_sock_7", "Weathervane", "river_pebble", "GreenBucket",
    "Mailbox12", "sponge_cake", "IronSkillet", "cloud_spoon",
    "Lawn Gnome", "paper_boat", "BoxOfNails", "dusty_shelf",
    "Candle Wick", "flask_of_tea", "cheater", "picnic_basket", "kicked",
    "disconnected", "connecting...", "error", "Toolbox_4",
    "Seashell", "drafty_window", "raccoon_paws", "WindChime",
    "flat_soda", "Pinwheel", "Butter Knife", "orange_peel",
    "Developer", "Admin", "Moderator", "Owner", "Host",
    "Guest", "Player", "Human", "Bot", "AI",
    "NPC", "Enemy", "Ally", "Teammate", "Friend",
    "Rival", "Nemesis", "Target", "Victim", "Killer",
    "Hammock", "SaltShaker", "frozen_peas", "Toast Rack",
    "ironing_board", "Bottle Cap", "CrumbleCake", "stray_balloon",
    "HotWaterBottle", "tile_grout", "Acorn Hat", "Desk Fan"
  ],
  weapons: [
    "tf_projectile_rocket", "sniperrifle", "scattergun", "minigun",
    "iron_bomber", "stickybomb_launcher", "targe_charge", "nessieclub",
    "market_gardener", "bazaar_bargain", "phlogistinator", "flamethrower",
    "scorch_shot", "tomislav", "knife", "eternal_reward", "ambassador",
    "obj_sentrygun3", "world", "trigger_hurt", "smg", "fireaxe",
    "airstrike", "big_earner", "force_a_nature", "loch_n_load",
    "revolver", "pistol", "bottle", "bat", "shovel", "wrench", "bonesaw",
    "fists", "shotgun_soldier", "shotgun_pyro", "shotgun_hwg",
    "backburner", "degreaser", "reserve_shooter", "blackbox",
    "rocketlauncher_directhit", "cow_mangler", "beggars_bazooka",
    "disciplinary_action", "escape_plan", "equalizer", "pain_train",
    "ullapool_caber", "loose_cannon", "scottish_resistance",
    "claidheamh_mor", "persian_persuader", "fryingpan", "ham_shank",
    "natascha", "brass_beast", "huo_long_heater", "family_business",
    "gloves_running_urgently", "fists_of_steel", "frontier_justice",
    "robot_arm", "jag", "southern_hospitality", "rescue_ranger",
    "blutsauger", "ubersaw", "vita_saw", "amputator", "solemn_vow",
    "sydney_sleeper", "machina", "hitmans_heatmaker", "classic",
    "bushwacka", "shahanshah", "tribalmans_shiv", "club", "diamondback",
    "letranger", "kunai", "sharp_dresser", "spy_cicle", "taunt_scout",
    "taunt_heavy", "taunt_pyro", "taunt_spy", "obj_sentrygun",
    "obj_sentrygun2", "obj_minisentry", "tf_projectile_pipe",
    "tf_projectile_arrow", "tf_projectile_jar", "deflect_rocket",
    "deflect_promode", "sawmill_blade", "train", "lava",
    "golden_frying_pan", "saxxy", "prinny_machete", "batsaber", "capper"
  ],
  chat: [
    "woof", "meow", "no we need more spies", "nice hit",
    "scorch shot and phlog is a sin", "so mean", "Hello",
    "can we get a medic my fellow men?", "ns", "lag",
    "spy behind", "F1", "F2", "gg", "ez", "diff", "sellout",
    "kick bot", "random crits are fair and balanced", "MEDIC!",
    "w+m1 noob", "spy has dead ringer", "f1 cheater", "selling keys",
    "thanks pally", "engineer gaming", "crocket", "pootis",
    "why do we have 5 snipers?", "move that gear up", "team?",
    "nice facestab", "uber popped", "spy is gun spy", "nt",
    "scunt", "medic gf", "buying hats", "demoknight tf2",
    "spy checking", "f2 he's clean", "mge me", "tryhard",
    "heavy update when", "pyro airblast pls", "sentry down",
    "dispenser here", "thanks doc", "nice unusual", "get rekt",
    "friendly hoovy dont kill", "cap the point", "push cart",
    "hightower no cap", "market gardener", "nice ping", "cl_interp abuser",
    "pocket medic", "pop it don't drop it", "pybro", "homewrecker",
    "sentry nest ahead", "stickies on point", "intel dropped",
    "we have no engineer", "medic why", "spy is disguised as heavy",
    "lime scout", "auto balance sucks", "scramble teams", "don't kill friendlies",
    "taunt kill", "killbind", "trade server?", "selling 2 ref",
    "nice cosmetics", "bot is aimbotting", "vote kick", "sorry lag",
    "bodyshot", "nice hacks", "teleporter entrance here", "uber ready",
    "battle medic", "stop dying", "gh", "gr", "ty",
    "I swear if I die to one more random crit I am uninstalling this game",
    "can one of the 4 snipers please switch to medic or power class thanks",
    "Selling Unusual Burning Flames Team Captain 2000 keys pure only no dupes",
    "dude stop taking the health pack when you have 124 hp and I'm burning to death",
    "why is nobody pushing the cart it literally moves backward when you don't touch it",
    "selling strange killstreak festive rocket launcher for 5 keys send trade offer",
    "kick the bot in the name of all that is holy please F1",
    "medic why did you pop uber on the sniper instead of the heavy?",
    "can someone please help me with this spy sapping my sentry over and over",
    "imagine using the phlog and scorch shot and thinking you have actual skill",
    "enemy team has 3 medics and we have 4 spies and a demoknight",
    "guys the spy is disguised as me don't let him backstab you",
    "Buying all backpacks quicksell prices only paying in refined metal add me",
    "sorry guys my ping just spiked to 9000 I can't move",
    "that hitreg was absolutely broken I was clearly behind the wall",
    "please stop capping on hightower we are just trying to deathmatch",
    "looking for a pocket medic for competitive 6s pm me for discord",
    "I have full uber charge stop running away from me you idiot",
    "how did that backstab count? he was looking right at me valve pls fix",
    "everyone go left side through the tunnel they have a sentry on the right",
    "press F1 to kick the cheater he is spinning in spawn",
    "thank you for the heals medic you are the only reason we are winning",
    "demo can you please destroy the nest upstairs before we push in?",
    "bind w kill", "quit smoking", "disconnecting in 3...", "lol", "lmao",
    "cringe", "based", "ratio", "L", "W", "rip bozo",
    "skill issue", "gaming chair diff", "touch grass"
  ],
  errors: [
    "SetupBones: invalid bone array size (2 - needs 3)",
    "No such variable \"$fogstart\" for material \"maps/ctf_2fort/water/water_2fort_-528_-1520_-128\"",
    "No such variable \"$bloomamount\" for material \"dev/blurfiltery_nohdr\"",
    "Error! Variable \"$yellow\" is multiply defined in material \"models/workshop_partner/player/items/all_class/jackbadge/jackbadge_limited\"!",
    "No such variable \"$basetexture\" for material \"effects/rockettrailsmoke\"",
    "KeyValues Error: RecursiveLoadFromBuffer: got } in key in file materials/models/props_foliage/grass_02.vmt",
    "Model models/props_gameplay/security_fence_section01.mdl not found and models/error.mdl couldn't be loaded",
    "MP3 initialized with no sound cache",
    "Requesting texture value from var \"$dummyvar\" which is not a texture value (material: skybox/sky_dustbowl_01rt)",
    "DataTable warning: player: Could not find table \"DT_TFPlayerScoringDataExclusive\"",
    "Failed to load sound \"vo\\scout_painsharp01.wav\", file probably missing from disk/repository",
    "Error: Material \"models/player/scout/scout_head\" : proxy \"AnimatedTexture\" unable to initialize!",
    "C_TFPlayer::Reset: restarting partial cycle",
    "Attempted to precache unknown particle system \"explosion_trail\"",
    "SOLID_VPHYSICS static prop with no vphysics model! (models/props_combine/combine_fence01b.mdl)",
    "CMaterial::PrecacheVars: error loading vmt file for models/props_gameplay/haybale",
    "unhandled sticker option \"sticker_path\"",
    "Error vertex file for 'models/player/scout.mdl' checksum -1234567890 should be 1234567890",
    "DispatchAsyncEvent: event id 9832 has no handler.",
    "SV_StartSound: weapons\\rocket_shoot.wav not precached (0)",
    "Bad pstudiohdr in GetSequenceLinearMotion()!",
    "C_BaseEntity::SaveData: missing field 'm_hOwnerEntity'",
    "Particles: StartCapEndCap: particle system 'flamethrower_crit_red' not found",
    "Scene 'scenes/player/scout/low/taunt01.vcd' missing!"
  ],
  system: [
    "Lobby updated",
    "Redownloading all lightmaps",
    "Compact freed 200704 bytes",
    "Connecting to 192.168.1.10:27015...",
    "Connected to 192.168.1.10:27015",
    "Network: IP 10.0.0.5, mode MP, dedicated No, ports 27015 SV / 27005 CL",
    "VAC secure mode is activated.",
    "Parsed 354 particle systems",
    "Initializing renderer...",
    "Host_WriteConfiguration: Wrote cfg/config.cfg",
    "Using specific color correction file: materials/correction/cc_2fort.raw",
    "Server has disabled lobby reservations",
    "Disconnect: Client disconnect.",
    "Processing rates updates...",
    "Changing map to pl_upward",
    "Precomputing lighting ... Done",
    "Dropped Player from server (Disconnect by user.)",
    "Game supporting: multiplayer",
    "Writing configuration to \"config.cfg\"",
    "Client \"User\" connected (127.0.0.1:27005)."
  ],
  achievements: [
    "Head of the Class", "Hard to Kill", "Master of Disguise",
    "Grey Matter", "Riftwalker", "Flamethrower", "Sentry Gunner",
    "Point Clicker", "Backstabber", "Double Donk", "Flag Bearer",
    "World Traveler", "Prime Cuts", "First Blood", "Nemesis",
    "Hardcore", "Impossible!", "Gotta Cap 'Em All", "Pyromancer",
    "Caber Tosser", "Sticky Jumper", "Rocket Man", "Scout's Honor"
  ],
  items: [
    "Mann Co. Supply Crate", "Refined Metal", "Reclaimed Metal", "Scrap Metal",
    "Name Tag", "Description Tag", "Decal Tool", "Dueling Mini-Game",
    "Giftapult", "Backpack Expander", "Tour of Duty Ticket",
    "Mann Co. Store Package", "Random Craft Hat", "Secret Saxton",
    "Pile of Robo-Key Gifts", "Noise Maker - Winter Holiday",
    "Spellbook Page", "Haunted Metal Scrap", "Unusual Parsley",
    "Golden Frying Pan (Rare!)", "Australium Rocket Launcher"
  ]
};

/* -------------------------------------------------------------------------
 * Quick processing presets (keyed into `exec preset_<name>`)
 * `codec` matches a key in CODEC_PROFILES, `position` matches LISTENER_POSITIONS;
 * `underwater` puts the listener under water (omitted = not).
 * hp 0 / lp 20000 leave the optional sender filters off: the measured TF2
 * path has no capture EQ beyond Opus's own voice high-pass and band edge.
 * gain > 1 overdrives the sender's int16 capture before encoding.
 * loss is the % of voice packets lost (the control labelled net_fakeloss: on
 * `steam` each sender message is a packet, lost whole; on the other profiles
 * single frames in bursts), jitter is net_fakejitter in ms; omitted = 0.
 * ------------------------------------------------------------------------- */

// The listener's first place on the page, what the built-in presets use and
// what the accuracy table renders a take with when its row names no room
// (order W3-17, Decision 1): no room, the game at Sound quality: Low
// (dsp_slow_cpu 1), which is Set B's state. The owner's choice.
const DEFAULT_LISTENER = 'open';

const PRESETS = {
  // Measured baseline: Steam voice as recorded with voice_loopback in 2026.
  modern:  { codec: 'steam',   position: DEFAULT_LISTENER, hp: 0, lp: 20000, voice_scale: 1.0, gain: 1.0, loss: 0  },
  // vaudio_celt: the real CELT 0.11, with the same receiver path.
  legacy:  { codec: 'celt_22', position: DEFAULT_LISTENER, hp: 0, lp: 20000, voice_scale: 1.0, gain: 1.0, loss: 0  },
  // Loud mic spam: overdriven capture, in the automatic room's tunnel.
  spam:    { codec: 'steam',   position: 'auto_tunnel', hp: 0, lp: 20000, voice_scale: 1.0, gain: 3.0, loss: 0  },
  // The listener under water: the whole sound through the game's water
  // preset (14). It was called "2fort sewers" until W3-17d; a sewer's
  // soundscape asks for the automatic room, not water.
  underwater: { codec: 'steam', position: DEFAULT_LISTENER, underwater: true, hp: 0, lp: 20000, voice_scale: 1.0, gain: 2.0, loss: 0 },
  // Bad connection: 18% of voice packets lost, plus 50 ms jitter.
  laggy:   { codec: 'steam',   position: DEFAULT_LISTENER, hp: 0, lp: 20000, voice_scale: 1.0, gain: 1.0, loss: 18, jitter: 50 }
};
// Built-in presets known by an older name: `exec preset_sewers` runs `underwater`.
const PRESET_ALIASES = { sewers: 'underwater' };

/* -------------------------------------------------------------------------
 * Codec profiles. Each runs a real codec: the Steam profiles the bundled
 * libopus 1.1.5, the CELT profiles CELT 0.11, `speex` Speex 1.0.2 and
 * `miles` Voxware VR12. Only `steam` is calibrated against a real TF2
 * recording; the CELT profiles'
 * settings are read from the game's own module (W3-03) and their codec is
 * the game's build (W3-08); Speex's codec and settings are read from the
 * game's module (W3-09) and reproduce a 32-bit game's recording (W3-18).
 * `miles` is not a TF2 codec (the Source engines of 2006 and 2007): its codec
 * checked against one recording of a 2006 engine, the rest of the profile not
 * (W3-20b, W3-22).
 *
 *   engine      : 'celt011' for CELT 0.11 (frameSize samples per packetBytes
 *                 packet, scaled by snd_bits / 16); 'speex' for the game's
 *                 Speex 1.0.2 module (frameSize samples in packetBytes
 *                 bytes at codecRate, 11025 Hz; snd_bits does not change
 *                 it); 'vr12' for vaudio_miles's VR12 (the same, 360
 *                 samples in 12 bytes); otherwise Opus
 *   codecRate   : codec sample rate (Opus: 8/12/16/24/48 kHz)
 *   modeRate    : CELT only, optional: the rate the CELT mode is created
 *                 with, when the engine feeds it sound at another rate
 *                 (codecRate). Frame times, bitrates, the gate and the
 *                 loss model use codecRate.
 *   bitrate     : bits per second at snd_bits 16 (Opus: 20 ms frames)
 *   application : 'voip' (SILK/hybrid capable) or 'lowdelay' (CELT only)
 *   signal      : Opus signal hint; 'voice' keeps music in hybrid mode,
 *                 matching the SILK/CELT crossover seen in the recording
 *   encoder     : libopus runtime ('1.1.5' or '1.6.1') / complexity / vbr /
 *                 dtx. Without it: libopus 1.6.1, complexity 10, CBR, no DTX
 *                 (`steam` runs the library's own 16-bit decoder too: see
 *                 senderGate.rule)
 *   captureEq   : optional FIR (linear gains interpolated between points)
 *                 applied at codecRate before the gate and encoder
 *   decoderEq   : optional FIR applied to decoded audio at codecRate
 *   senderGate  : Steam's sender voice gate. With rule 'steam' (the `steam`
 *                 profile) a render runs Steam's own sender, read from its
 *                 client (steam-sender.js: capture chunks, the mean of |x|
 *                 at 1% of full scale or a peak at 15%, 100 ms kept, a 0.4 s
 *                 hold on Steam's 32-bit float clock, whose length depends
 *                 on how long the sender's Steam has run), decodes to 16
 *                 bits with the library's opus_decode
 *                 and Steam's decoder rules, and resamples each packet with
 *                 FFmpeg's libswresample (vendor/swresample) as Steam's
 *                 decoder does; the three numbers are then only the frame
 *                 model below, for the tools that line a take up with it.
 *                 Without a rule, the 20 ms frame model: a frame above
 *                 thresholdDb (RMS, dBFS) is sent with the prerollMs before
 *                 it and the holdMs after it; other frames are not sent.
 *                 Profiles without a senderGate transmit continuously
 *                 (push-to-talk engine codecs).
 *   voiceRate   : rate at which the engine receives decoded voice and runs
 *                 its auto-gain (128-sample blocks), and at which the voice
 *                 is entered into the mixer: 44100 Hz is mixed as it is,
 *                 22050 Hz upsampled by two once and 11025 Hz twice, by the
 *                 mixer's own rule (engine/mix.js mixUpsample2; W3-10)
 *   status      : 'measured' | 'experimental' | 'modeled' | 'unverified'
 *                 (nothing reads it)
 * ------------------------------------------------------------------------- */
const CODEC_PROFILES = {
  steam: {
    displayName: 'Steam voice (Opus 24 kHz VBR, 32 kbps)',
    // Steam's voice packets are libopus 1.1.x, 32 kbps VBR with DTX: the same
    // frame sizes, DTX decisions and decoded spectrum as the SourceTV packets
    // (tests/REFERENCE_2026.md). Steam sets no complexity, so the library's
    // default, 9 (W3-09 section 3, finding 28); 8, 9 and 10 give the same
    // packets (19,428 frames).
    codecRate: 24000, bitrate: 32000, application: 'voip', signal: 'voice',
    encoder: { runtime: '1.1.5', complexity: 9, vbr: true, dtx: true },
    // Steam's capture resampler rolls the band edge off from 11.1 kHz.
    captureEq: {
      taps: 255,
      freqs:   [0, 11000, 11150, 11250, 11350, 11450, 11550, 11650, 11750, 11850, 12000],
      gainsDb: [0, 0,     -0.1,  -0.35, -0.9,  -2.2,  -3.4,  -4.8,  -6.6,  -7.8,  -8.5]
    },
    // rule 'steam': a render sends as Steam's client does (steam-sender.js,
    // findings 5, 12 and 28) and decodes as its decoder does (finding 29). The
    // three numbers are the 20 ms frame model of finding 12, a fit: a frame
    // over -39.5 dBFS RMS sent with the 120 ms before it and the 440 ms after.
    // Neither the render nor the live chain reads them (the live chain runs
    // the render's own stages since W3-11b). They stay for the tools that
    // line a take up with that model (reference.js, app/realtake.js: they
    // find a take's spurts within a few frames, and reference.js scores the
    // registered predictions).
    senderGate: { rule: 'steam', thresholdDb: -39.5, prerollMs: 120, holdMs: 440 },
    voiceRate: 44100, status: 'measured'
  },
  // Optional fullband profile, NOT a verified TF2-era or native-rate preset.
  steam_48: {
    // Not the game's path: the 20 ms frame gate, the float decode and the
    // app's own resampler (Steam's sender is 24 kHz into a 24000 to 44100 Hz
    // resampler).
    displayName: 'Fullband Opus (48 kHz / 64 kbps, experimental, not the game\'s path)',
    codecRate: 48000, bitrate: 64000, application: 'voip', signal: 'voice',
    encoder: { runtime: '1.1.5', complexity: 10, vbr: true, dtx: true },
    senderGate: { thresholdDb: -39.5, prerollMs: 120, holdMs: 440 },
    voiceRate: 44100, status: 'experimental'
  },
  // vaudio_celt: CELT 0.11 (vendor/celt-0.11) in a custom mode, 22050 Hz,
  // 512-sample frames (23.2 ms), 64-byte packets (22.05 kbps), complexity 5:
  // read from the game's module (W3-03); the packet size and rate confirmed
  // by Set H. The bundled build is the game's: the pitch pre-filter and
  // post-filter compiled in, the reset after creation, 16-bit in and out
  // (W3-08, tests/LEGACY_CODECS.md). The receiver side is modeled.
  celt_22: {
    displayName: 'vaudio_celt (CELT 0.11, 22 kHz, 64-byte frames)',
    engine: 'celt011', codecRate: 22050, frameSize: 512, packetBytes: 64, complexity: 5,
    bitrate: 22050, voiceRate: 22050, status: 'modeled'
  },
  // vaudio_celt_high: the same CELT 0.11 in its 44100 Hz mode, 1024-sample
  // frames, 128-byte packets, complexity 5, fed 22050 Hz sound: so a frame
  // lasts 46.4 ms, 128 bytes a frame is 22.05 kbps, and the mode's 20 kHz
  // band edge falls at 10 kHz of real sound. Read from the game's module
  // (W3-03); the packet size and rate confirmed by Set H; the build as for
  // vaudio_celt (W3-08). The key stays celt_44 so saved settings keep
  // working. The receiver side is modeled.
  celt_44: {
    displayName: 'vaudio_celt_high (CELT 0.11, 44.1 kHz mode on 22 kHz sound, 128-byte frames)',
    engine: 'celt011', codecRate: 22050, modeRate: 44100, frameSize: 1024, packetBytes: 128, complexity: 5,
    bitrate: 22050, voiceRate: 22050, status: 'modeled'
  },
  // vaudio_speex: read from the game's module (docs/reports/
  // W3-09-steam-voice.md, section 5); no recording of it can exist, since a
  // current game asked for vaudio_speex runs vaudio_celt (section 6). Speex
  // 1.0.2 (vendor/speex-1.0.2, W3-12a) narrowband at quality 4 (the engine's
  // 3): 160-sample frames in 20 bytes, constant bit rate, enhancement on,
  // complexity 2. The module does not resample: the codec, which believes it
  // runs at 8000 Hz, is fed the engine's 11025 Hz sound, so a frame lasts
  // 14.51 ms, 20 bytes a frame is 11.025 kbit/s and the band reaches 5.5 kHz;
  // the voice rate is 11025 too, so nothing resamples after the decoder.
  // Decoded samples wrap past full scale. snd_bits picks nothing (the module
  // has one table row for the engine's argument). A lost frame plays as zeros:
  // what the engine plays for a lost Speex packet was not read. The receiver
  // side is modeled. Status: codec and settings read from the module; not
  // recorded.
  speex: {
    displayName: 'vaudio_speex (Speex 1.0.2 on 11 kHz sound, 11 kbps)',
    engine: 'speex', codecRate: 11025, frameSize: 160, packetBytes: 20, bitrate: 11025,
    voiceRate: 11025, status: 'modeled'
  },
  // vaudio_miles: NOT A TF2 CODEC. A codec of the Source engine family that
  // could be selected in the Source engines of 2006 and 2007 (Source SDK Base
  // 2006 and 2007); current TF2 ships its files and refuses the name. The
  // codec stage is those engines', read from their files (W3-20b): Voxware's
  // VR12 (vendor/voxware-vr12, W3-20a) behind the module's wrapper, 360
  // samples in 12 bytes, each sample cut to its top 8 bits before the codec.
  // Those engines capture, code, decode and play voice at 11025 Hz for every
  // codec and resample nothing, so VR12, an 8000 Hz codec, codes 11025 Hz
  // sound as if it were 8000 Hz: a frame lasts 32.65 ms, the wire carries
  // 2940 bit/s and the band reaches 5.5 kHz. The sender's encoder and the
  // receiver's channel are two codec objects, each reset at the render's
  // start; nothing resamples after the decoder; the gain runs on the decoded
  // samples from the first (W3-19). The wrapper's start-up block, uninitialised
  // memory in the engines, is coded as zeros here. Three stand-ins: a new talk
  // spurt (the app's gate, or the live key) resets both sides, where the
  // engines reset the receiver only after a pause longer than its buffer; the
  // gain is held through time nothing was sent, where the engines reset it
  // when a channel is assigned; a lost or late frame plays as 360 zeros in its
  // own place, where in the engines nothing is queued for it. Everything after
  // the gain (the mixer, rooms, output) is TF2's of today. Its codec stage was
  // checked against one sitting of a 2006 engine on 2026-11-13; the profile as
  // the app runs it was not. That sitting's second press came out in 143,913
  // of the game's 145,800 samples after the gain when the receiver's codec was
  // reset twice before it and the sender's once (measured; why twice was not
  // read); the profile's rule for a new talk spurt was left a stand-in.
  // snd_bits picks nothing.
  miles: {
    displayName: 'vaudio_miles (Voxware VR12 on 11 kHz sound, 2.9 kbps; Source 2006/2007, not TF2)',
    engine: 'vr12', codecRate: 11025, frameSize: 360, packetBytes: 12, bitrate: 2940,
    voiceRate: 11025, status: 'unverified'
  }
};

/* -------------------------------------------------------------------------
 * Receiver voice path, identified from the 2026 test-signal takes:
 *
 *   autoGain  : Source's voice-channel auto-gain on int16 voice at 44.1 kHz,
 *               voice_avggain 0.5 and voice_maxgain 10 by default. Per block
 *               of the engine's 128 samples the target gain is
 *                 min(maxGain, 32767 / (mean + avgGain * (peak - mean)))
 *               and the next block ramps toward it in whole 1/128 steps of
 *               the difference over 127, voice_scale entering twice; the
 *               output clamps to int16. engine/gain.js gainRule() has the
 *               exact update and its block size (GAIN_BLOCK).
 *   mixRate   : the mixer's rate, a constant of the engine's code (W3-07);
 *               engine/mix.js MIX_RATE
 *   deviceRate: the listener's sound device (snd_device_rate, the app's own
 *               setting, not a TF2 variable): the system's mixer converts the
 *               game's 16-bit 44100 Hz output to it by linear interpolation
 *               (engine/mix.js createDeviceStage, a model: W3-07 measured it at
 *               48000 Hz, the takes' rate; another rate runs the same rule).
 *               44100 has no such stage.
 *   volume    : the game's `volume`, after the mixer's clip; 1, the game's
 *               own default (W3-10; the app used 0.5 before). The
 *               recordings' ceiling (-16.5 dBFS) is the owner's `volume
 *               0.15`, so this is a setting, not a fit.
 *   network   : the loss and jitter fits to the net_fakeloss / net_fakelag /
 *               net_fakejitter takes of the network test signal, made with a
 *               per-frame model. Loss: lost 20 ms voice frames in bursts of
 *               2.2 on average, concealed by the codec; since BC-1 only the
 *               engine codecs and steam_48 draw loss this way: `steam` loses
 *               each sender message whole by a draw of its own
 *               (engine/network.js, steamMessageLoss), as the game loses a packet. Jitter
 *               (BC-4): on `steam` on the game's voice queue the tick each
 *               message reaches the receiver (engine/network.js,
 *               steamArrivals: net_fakelag's lists as read), and nothing on
 *               the file's own timing; the numbers below are not used there.
 *               The other profiles keep the fit: late frames (3.2% of frames
 *               at net_fakejitter 50, scaled linearly), one in ten of which
 *               plays as silence instead of concealment (a fit; the game
 *               makes no frame late, finding 9).
 * ------------------------------------------------------------------------- */
const VOICE_ENGINE = {
  mixRate: 44100,
  autoGain: { avgGain: 0.5, maxGain: 10 },
  deviceRate: 48000,
  volume: 1,
  network: { burstMeanFrames: 2.2, lateFramesAt50ms: 0.032, underrunShare: 0.1 }
};

/* -------------------------------------------------------------------------
 * The names of dsp_room 0-29, as the page has long called them (from the
 * public mirror of the game's preset file), and the app's own custom room
 * (99). Their numbers live in room-presets.js, the game's own file as
 * numbers (order W3-17); room-dsp.js runs them.
 * ------------------------------------------------------------------------- */
const DSP_PRESETS = {
  0:  { name: 'Off (no room)' },
  1:  { name: 'automatic (the map measures the room; give the measures)' },
  2:  { name: 'Metal Small' },
  3:  { name: 'Metal Medium' },
  4:  { name: 'Metal Large' },
  5:  { name: 'Tunnel Small' },
  6:  { name: 'Tunnel Medium' },
  7:  { name: 'Tunnel Large' },
  8:  { name: 'Chamber Small' },
  9:  { name: 'Chamber Medium' },
  10: { name: 'Chamber Large' },
  11: { name: 'Brite Small' },
  12: { name: 'Brite Medium' },
  13: { name: 'Brite Large' },
  14: { name: 'Water 1' },
  15: { name: 'Water 2' },
  16: { name: 'Water 3' },
  17: { name: 'Concrete Small' },
  18: { name: 'Concrete Medium' },
  19: { name: 'Concrete Large' },
  20: { name: 'Outside Small' },
  21: { name: 'Outside Medium' },
  22: { name: 'Outside Large' },
  23: { name: 'Cavern Small' },
  24: { name: 'Cavern Medium' },
  25: { name: 'Cavern Large' },
  26: { name: 'Weirdo 1' },
  27: { name: 'Weirdo 2' },
  28: { name: 'Weirdo 3' },
  29: { name: 'Weirdo 4' },
  // The app's own room, not the game's: engine/room.js maps its three knobs
  // onto the engine's processors.
  99: { name: 'Custom: the app\'s own, not the game\'s', custom: true }
};

// Words the console's dsp_room takes for a number.
const ENV_ALIAS = {
  none:   0,
  dry:    0,
  room:   17,  // Concrete Small
  locker: 8,   // Chamber Small
  hall:   22,  // Outside Large
  custom: 99
};

/* -------------------------------------------------------------------------
 * The numbered rooms a map sets (order W3-17, part d, item 1; R1 4): the
 * numbers the game's soundscape scripts ask for other than 0 and 1, each
 * named by the script and its areas. Which map loads which script was not
 * read, so no map file is named.
 * ------------------------------------------------------------------------- */
const ROOM_NUMBERS = [
  [2, 'harbor: spawn rooms and exits'],
  [3, 'harbor: fuel rooms'],
  [4, 'harbor: headquarters'],
  [5, 'soho: underground'],
  [11, 'soho: indoors'],
  [17, 'warehouse: spawn and boilers; rottenburg: spawn'],
  [18, 'warehouse: foyer; moonbase: underground'],
  [21, 'soho: streets; rottenburg: town; medieval: outside'],
  [25, 'warehouse: main hall'],
  [26, 'halloween: underworld']
];

/* -------------------------------------------------------------------------
 * The listener's places (order W3-17, part d). Each key is a value of the
 * page's "Listener position" and `room` is what it asks of audio.js's
 * opts.room: null (no room), { auto: key } (the automatic room built by
 * room-dsp.js from a case's or a place's measures) or { preset: n }.
 * `group`: none (the dry case), recorded (the two automatic rooms fitted to
 * a recording), example (the named shapes, room-dsp.js ROOM_CASES), place
 * (the rows of room-dsp.js ROOM_PLACES, measured by the game on a map) or
 * number (ROOM_NUMBERS). The page takes the cases' and places' labels from
 * room-dsp.js; "manual" (the number or the measures in the manual panel)
 * is the page's own and not here.
 *   The older positions (`legacy`) are not offered. They stay so that an old
 * share link or saved setting lands on the preset each stood for (the page
 * makes it manual with that number; `water` becomes no room under water),
 * and so that audio.js maps an old caller's listenerPos as before.
 * ------------------------------------------------------------------------- */
const LISTENER_POSITIONS = (function () {
  const out = {
    open: { group: 'none', room: null, label: 'No room effect (the game\'s Sound quality: Low)', variable: 'dsp_slow_cpu 1' }
  };
  for (const key of ['set_c_room', 'set_d_street']) out[`auto_${key}`] = { group: 'recorded', room: { auto: key } };
  for (const key of ['closet', 'small_room', 'room', 'large_room', 'great_hall', 'vent', 'corridor', 'long_corridor',
    'tunnel', 'big_tunnel', 'alley', 'street', 'courtyard', 'open']) out[`auto_${key}`] = { group: 'example', room: { auto: key } };
  for (const key of ['2fort_spawn_room', '2fort_spawn_long', '2fort_indoor', '2fort_tunnel', '2fort_pond']) {
    out[`place_${key}`] = { group: 'place', room: { auto: key } };
  }
  for (const [n, where] of ROOM_NUMBERS) out[`room_${n}`] = { group: 'number', room: { preset: n }, label: `${n}: ${where}` };
  // The page's positions before W3-17d, by the preset number each stood for.
  const legacy = { hallway: 22, small_room: 17, tunnel: 6, tunnel_big: 7, cavern: 24, hangar: 10, chamber: 19, water: 14, metal: 4 };
  for (const [key, dsp] of Object.entries(legacy)) out[key] = { legacy: true, dsp };
  return out;
})();

const FCVAR = { NONE: 0, CHEAT: 1 << 0, READONLY: 1 << 1, SERVER: 1 << 2 };
