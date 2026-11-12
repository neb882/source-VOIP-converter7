# S3-03 report: invented names in the page's mock console feed

**Branch:** `claude/s3-03-mock-names`, from `main` at `99cce1e`. **Order:** `docs/work-orders/S3-02-engine-split.md`,
its section on S3-03 and ruling 7. **Files changed:** `constants.js` (the two lists only), `tests/browser.verify.js`
(one check), `sw.js` (`CACHE` v35 to v36), `tests/predictions/PREDICTIONS.md` (one dated paragraph), this report.

## Summary

The page's console prints a mock game server's lines with player names from `TF2_DATA.playerNames` and chat lines
from `TF2_DATA.chat`. Every entry of the names list that was a handle is now an invented handle made of ordinary
words and objects. The class names and the lobby's role and status words stay where they were. The one chat line
that named a person now names nobody. A browser check pins the two lists by their SHA-256, so a later change to
either is a decision someone made. No render reads either list.

## What changed, by line (`constants.js`)

| Lines | Before | After |
| --- | --- | --- |
| 28 to 49, 54 to 56 | 126 entries in all, 97 of them handles | the 97 handles replaced by invented ones, one for one, in the same places; the line layout kept |
| 36, 40, 46, 47 | `unnamed`; the three class names; two status words; three status words | unchanged |
| 50 to 53 | 20 role words of a lobby | unchanged |
| 115 | a chat line naming a person in a mock oath | "kick the bot in the name of all that is holy please F1" |

The list still has 126 entries, all different from one another. The chat list still has 125 lines.

No removed name is repeated in this report, the commit message, a test or a comment.

### What stayed, and why

The order says "Class names, roles and plain words stay"; the brief says to replace the whole list. Both are met by
reading the order's sentence as the entries that are no one's handle: the class names (line 40), the role words of
lines 50 to 53, and the words a server prints for a state (lines 36, 46, 47). Each of these is what the game or a
server calls a player, not a handle anyone chose. Every other entry was treated as a handle and replaced, plain
single words included (the names list may have been drawn from real players, and a plain word can be someone's
handle). One kept entry is the plain word that the suites quote for other things; no suite reads it from this list.

### The chat list read through

Every line was read for a name or a plain pointer to a real person. Line 115 was the only one. Two lines were
looked at and kept: line 99 uses the players' word for a friendly Heavy, a role, not a person; line 127 asks the
game's maker to fix a bug, which names a company and no person.

## The new names

`teapot_lid`, `gravel_path`, `pinecone42`, `LampShade`, `soggy_waffle`, `Kettle Drum`, `bucket_of_bolts`,
`Paperclip31`, `quiet_moth`, `Doorknob`, `RustyHinge`, `corn_on_cob`, `TinCanPhone`, `mossy_rock`, `Spoon Thief`,
`pickle_jar`, `Lantern9`, `hat_rack`, `cardboard_tube`, `sock_drawer`, `velvet_toad`, `Umbrella Stand`, `gumdrop77`,
`HalfToaster`, `wet_matches`, `Clothespin`, `lint_roller`, `barnacle_jar`, `big_ladle`, `Muffin Tin`, `snowglobe5`,
`cactus_hugger`, `Old Tire`, `wobbly_chair`, `Sandpaper`, `thimble`, `PotatoClock`, `Stapler Jr`, `birdbath`,
`Fence Post`, `noodle_strainer`, `CopperPot`, `rainboot`, `Garden Hose`, `toothpick99`, `bathtub_duck`, `Brick Wall`,
`MarbleBag`, `sleepy_owl`, `PlankOfWood`, `jam_jar_9`, `Coat Hook`, `tumbleweed`, `Lighthouse_Lamp`,
`puddle_jumper`, `Haystack`, `bent_fork`, `Teacup Pilot`, `walnut_shell`, `OvenMitt`, `Chalkboard`, `lost_sock_7`,
`Weathervane`, `river_pebble`, `GreenBucket`, `Mailbox12`, `sponge_cake`, `IronSkillet`, `cloud_spoon`,
`Lawn Gnome`, `paper_boat`, `BoxOfNails`, `dusty_shelf`, `Candle Wick`, `flask_of_tea`, `picnic_basket`,
`Toolbox_4`, `Seashell`, `drafty_window`, `raccoon_paws`, `WindChime`, `flat_soda`, `Pinwheel`, `Butter Knife`,
`orange_peel`, `Hammock`, `SaltShaker`, `frozen_peas`, `Toast Rack`, `ironing_board`, `Bottle Cap`, `CrumbleCake`,
`stray_balloon`, `HotWaterBottle`, `tile_grout`, `Acorn Hat`, `Desk Fan`.

## How the names were chosen and checked

- Each is built from household objects, food, garden things or small animals, sometimes with a short number or an
  underscore, as players write handles.
- No first names or surnames, no fictional characters, no games, no brand names. Candidates dropped while choosing:
  a word that is a vacuum flask's trade mark, a phrase that is a technology site's name, a word that was a watch
  maker's, a cartoon character's first word, a game's title, and a "rubber duck" too common to be safe.
- No numbers with a hate meaning (88, 14 and their kin) and none with a crude one. Nothing crude, nothing that is a
  slur in any spelling.
- What could and could not be checked: there was no web search. A name was avoided only when it was recognised as a
  person's, a known player's, a streamer's, a video maker's, a company's or a brand. Any of these short handles may
  be in use by someone somewhere; none is known to belong to anyone well known, and none reads as a person. The
  order's reviewer reads the list for the same thing.

## The check and its break

In `tests/browser.verify.js`, `[Browser 2]`, after the console's markup checks: the page computes the SHA-256 of
`JSON.stringify([TF2_DATA.playerNames, TF2_DATA.chat])`, encoded as UTF-8 (`TextEncoder`), and the check asks for
`e6d5eaf66ce0d6034aaaa09e19f73df37e4e37fcdd164cf4d9c569aa19797ba8`. The same serialisation in Node gives the same
value. The test names no entry.

The break: one name changed (line 56's last entry, "Desk Fan" to "Desk Lamp") and the suite run under the lock. It
stopped at the new check:

```
  ok    console input cannot execute markup
Error: the mock console's player names and chat lines are the lists recorded in S3-03 (dca48ec7c2ec1bbbc83a1a1c0497e0cd2b6021e9afcc2be36f8e3c9fc57132e6)
```

The name was restored and the file compared byte for byte with the shipped one.

## The suites

| Suite | Command | Result |
| --- | --- | --- |
| browser, on `main` before the change | `CHROMIUM_EXECUTABLE=... flock /tmp/tf2ve-heavy.lock node tests/browser.verify.js` | passed |
| browser, on the change | the same | passed |
| miles | `node tests/miles.verify.mjs` | passed |
| formats | `node tests/formats.verify.mjs` | passed |
| CI (`tests` workflow) on the code commit | run 43183542083 on `895fdcf` | passed (job `verify`) |

The browser suite's check lines on the change are those on `main` plus the one new check: no other check reads a
name or a chat line. No Node suite was touched; another builder is rewriting their loaders.

## The scan before pushing

The branch's diff and commit messages were scanned for what CLAUDE.md's hard rules forbid: recordings, personal
details, real SteamIDs, model names, and the removed names. None was found.
