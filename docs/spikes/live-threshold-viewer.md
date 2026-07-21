# Live threshold viewer spike

## Outcome

Server-side transient re-diffing is viable as a pause-to-update exploration tool, but not as frame-by-frame feedback while dragging a slider. The prototype waits 250 ms after the last slider input, aborts stale browser requests, reuses the cached A/B screenshots, and returns an uncached PNG plus threshold and mismatch metrics. It does not write the generated image or update the run.

The visual result is useful: on the measured page, raising the threshold from `0.05` to `0.10` to `0.20` reduced mismatch from `22.3072%` to `18.7664%` to `15.9329%`.

## Measurement

Measured on 20 July 2026 with an Apple M3 Pro (36 GiB RAM), macOS 26.5.2, and Node 25.8.2. The cached `/pasadena` screenshots from run `2026-04-27-Mq6FuE8G` were 1280×14,053 and 1280×12,263 (7.40 MiB compressed together). The output canvas was 1280×14,053.

- Five warm API requests completed in 1.97–2.32 seconds (2.23-second median). Returned PNGs were 1.77–2.01 MiB.
- A direct measurement of the same pipeline took 581 ms to decode, 14 ms to pad, 745 ms for `pixelmatch`, and 831 ms to encode: 2.17 seconds total excluding HTTP.
- One normalized RGBA plane is 68.6 MiB, so A, B, and output alone require at least 205.9 MiB. Process RSS grew from 49.5 MiB to 673.6 MiB during the synchronous Node pipeline because PNG decoding and size padding retain additional buffers.
- SHA-1 checksums for the run's `meta.json` and canonical `diffs/pasadena.png` were identical before and after all requests.

These are local spike measurements, not a capacity benchmark. The current synchronous decode, compare, and encode work blocks the Next.js server process for roughly two seconds per tall-page request. Aborting a browser request prevents stale UI updates, but it cannot stop server work that has already begun.

## Client-side feasibility

A browser implementation would avoid a server round trip, but this sample still needs at least 205.9 MiB for three normalized RGBA planes, before decoded-image, canvas, and transfer overhead. Running `pixelmatch` on the main thread would also spend roughly the measured comparison time blocking interaction. A Web Worker with transferable buffers or `OffscreenCanvas` could protect the UI thread, but would not remove the memory pressure. A second prototype was not warranted for this spike.

## Recommendation

For a production feature, keep the server API shape but move PNG decode/diff/encode work to a bounded worker-thread pool so it cannot block requests. Coalesce superseded thresholds per run/slug, cap any decoded-image cache, and consider a lower-resolution preview while dragging followed by a full-resolution result after release. A browser worker remains a possible opt-in path for smaller screenshots, selected by measured dimensions and memory budget.
