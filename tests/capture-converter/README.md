# Windows's rate converter's references

Two implementations of Windows's rate converter, in Python, each written by its reader from their own reading of
Windows's files (`tests/REFERENCE_2026.md`, finding 28), and the vectors made from them. The app's
`capture-converter.js` (order W3-26a, `docs/work-orders/W3-26-capture-conversion.md`) must give the first
reader's samples bit for bit, and the second reader's within 3 parts in a million of full scale. These four files
are the orchestrator's: a builder does not edit them.

- `winsrc.py`: the first reader's converter. `design()` makes the polyphase table for a pair of rates and a
  quality, `convert()` runs it, `response()` gives its gain. Its two lookup tables (the sinc and the Kaiser
  window) are computed from their closed forms; nothing in it is copied from a file of the owner's.
- `src2.py`: the second reader's converter, the same in form, from the second reading. Its tables are computed
  from closed forms too.
- `make_vectors.py`: runs both at quality 30 to 24,000 Hz on a seeded source and writes `vectors.json`. The
  source is made of whole 16-bit steps from `mulberry32(seed)`, as the engine's, so Node makes the same samples.
  Each reference is given the source followed by zeros and its output is cut to the app's length,
  `max(1, round(n L / M))`.
- `vectors.json`: nine cases, base64 of little-endian float32. Eight are pairs both references build (48,000
  and 44,100 Hz with 1,200 source samples; 96,000, 32,000, 22,050, 16,000, 11,025 and 8,000 Hz with 400), each
  with both outputs, how far apart they are and how many 16-bit steps differ; the 48,000 and 44,100 Hz cases also
  hold row 0 of both tables and the second reference's gain in dB at nine frequencies. The ninth, 44,056 Hz, is a
  pair outside Windows's limits for a stored table, which both references refuse: its one output is the script's
  own loop through the first reader's kernel with a sum in double precision (the app's own rule there).

The names `README.md`, `check_tables.py` and `tables.py` in the references' headers are the readers' private
notes and are not in this repository.

To make the vectors again, or to compare them with what the script writes:

```sh
python3 -I tests/capture-converter/make_vectors.py           # writes vectors.json
python3 -I tests/capture-converter/make_vectors.py --check   # compares, writes nothing
```

It needs Python 3 with numpy (the file as committed was made with Python 3.11.18 and numpy 2.4.6). CI does not run
Python: `tests/capture-converter.verify.mjs` holds the module to `vectors.json` as it stands.
