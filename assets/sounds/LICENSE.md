# Sound Asset Provenance

## celebration.wav

- **Source**: Self-generated (programmatic synthesis).
- **Generation method**: Two overlapping sine tones (C5 = 523.25 Hz, E5 = 659.25 Hz) with raised-cosine envelopes, summed and normalized to 16-bit PCM mono at 22050 Hz. The generator script lived in the commit that introduced this file (Phase B-5).
- **Duration**: ~0.30 s
- **License**: CC0 1.0 (public domain dedication). No third-party samples were used.
- **Why this matters**: The audio is generated from first principles (no recordings, no third-party samples), so the project carries zero copyright risk. If a future revision swaps it for a higher-fidelity professional asset, that asset's license must be re-checked and this file updated.

## Adding new sounds

1. Place the file under `assets/sounds/`.
2. Add an entry to this file with: source, license, attribution requirement (if any), and the file size.
3. If the license requires attribution (e.g. CC-BY), surface it in the in-app credits screen (SET-08 once it lands).
