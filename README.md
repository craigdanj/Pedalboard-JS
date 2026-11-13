# Pedalboard JS · Signal

Version 1.0.0. Dependency-free ES modules for live browser guitar effects and reuse in a browser DAW. MIT licensed. All live processing is local; no third-party samples or fonts are required.

## Run

Serve `dist/` over HTTPS or localhost. Do not open with `file://`.

```bash
cd dist
python3 -m http.server 8080
```

Open http://localhost:8080 and click **Test riff**. This starts a synthesized plucked-string loop for checking the effects without hardware. To play guitar, connect a USB interface's instrument/Hi-Z input, select the interface as your system output, connect wired headphones to it, and turn direct monitoring off. Click **Start audio**, then **Connect guitar**, grant microphone permission, and choose the correct input channel. If you change the input device dropdown, click Connect guitar again. Start with low headphone gain; the digital master defaults to −12 dB.

## Features

- Pre/post RMS dBFS meters with peak clipping indicators.
- Pre-effects monophonic YIN tuner, Hz, note/octave, cents and silent tuning.
- Stereo-linked AudioWorklet noise gate with hysteresis, threshold, attack and release.
- Soft-knee compressor with threshold, ratio, attack, release and makeup.
- 4× oversampled tanh overdrive with drive, tone and output level.
- Low/high shelf and variable-frequency parametric mid EQ.
- Modulated delay chorus with rate, depth and wet/dry mix.
- Filtered feedback delay with time, feedback, tone and mix.
- Generated stereo convolution reverb with decay, tone and mix.
- Cabinet convolution with mono/stereo IR upload, low/high cuts and level.
- Eight reorderable pedals, individual smooth bypass and global dry bypass.
- Five factory sounds: Clean Room, Edge of Breakup, Glass Chorus, Ambient Trail, Slapback.
- Named browser-local presets; JSON import/export including custom cabinet IR audio.
- Responsive UI, keyboard controls, setup/API guide and verification harness.

## Independent effect usage

Use the host DAW's existing AudioContext. Connect effects into the track mixer, not directly to speakers, when integrating with a DAW.

```js
import { createEffect } from './src/pedalboard.js';

// Inside a user gesture; or use an existing host context.
const context = new AudioContext({ latencyHint: 'interactive' });
await context.resume();
const drive = await createEffect(context, 'overdrive', {
  params: { drive: 30, tone: 3500, level: -12 }
});
const delay = await createEffect(context, 'delay', {
  params: { time: 375, feedback: 30, mix: 20 }
});
source.connect(drive.input); // source is any AudioNode
// Accepts another effect or an AudioNode:
drive.connect(delay);
delay.connect(trackMixer);
drive.setParam('drive', 45);
delay.setEnabled(false);
// On track removal, disconnect the source and dispose owned effects:
drive.dispose();
delay.dispose();
```

## Full board

```js
import { Pedalboard } from './src/pedalboard.js';
const board = await Pedalboard.create(context);
source.connect(board.input);
board.output.connect(trackMixer);
board.effects.chorus.setEnabled(true);
board.effects.chorus.setParam('mix', 35);
board.setOrder([
  'gate', 'compressor', 'overdrive', 'eq',
  'chorus', 'cabinet', 'delay', 'reverb'
]);
const preset = board.serialize();
board.applyPreset(preset);
board.setBypassed(true);
board.dispose();
```

All eight effects must occur exactly once in `setOrder`. A board owns its effect output connections; do not manually rewire them. Use individual effects for custom routing.

## Cabinet IRs

```js
const cabinet = await createEffect(context, 'cabinet');
await cabinet.loadIR(await file.arrayBuffer(), {
  name: file.name, id: 'my-ir-asset'
});
cabinet.useBuiltIn();
```

Use a browser-decodable mono/stereo file, no longer than five seconds. The demo caps files at 5 MB. WAV is a useful portable format. Cabinet IR amplitudes are preserved: convolution normalization is disabled. Reduce volume before loading an unfamiliar IR. Use assets you have permission to use.

The included cabinet is a short **synthetic filter**, not a recorded speaker or amp model. The reverb is generated too. No third-party recordings are bundled, and no branded hardware emulation is claimed.

Library serialization records `irId` and `irName`, not audio bytes. The host must store/resolve the asset and call `loadIR` after `applyPreset`; numerical settings and bypass are applied by the board. The demo resolves IRs automatically using IndexedDB and embeds the asset as Base64 when exporting a JSON preset.

## API and lifecycle

Exports: `VERSION`, `EFFECTS`, `initialize`, `Effect`, `NoiseGate`, `Compressor`, `Overdrive`, `Equalizer`, `Chorus`, `Delay`, `Reverb`, `Cabinet`, `createEffect`, `Pedalboard`, `validatePreset`, `detectPitch`, `noteFromFrequency`, `levels`, `gainToDb`, `dbToGain`.

Each effect exposes `input`, `output`, `setParam(name, value)`, `configure(params)`, `setEnabled(boolean)`, `connect(destination)`, `disconnect()`, `serialize()` and `dispose()`. The compressor exposes `reduction` in dB. `EFFECTS[type].params` supplies labels, units, defaults, min/max and step sizes for host UIs. Setters clamp finite values to their ranges; unknown parameters and nonfinite input are rejected. Imported presets are strictly validated.

`initialize(context)` registers the gate worklet once per context. The async `createEffect` and `Pedalboard.create` handle registration. Direct `new NoiseGate(context)` requires awaiting initialize first. The other constructors are synchronous. Dispose stops owned oscillators, clears pending timers and disconnects internal nodes; it does not close the host context or stop the input source. Bypassed effects keep processing to retain their state. Effect/global bypass uses a short crossfade.

## Saved sounds

Named presets retain parameter values, pedal order and engagement, input/master levels and cabinet selection. Saving an existing name updates it. Input device, input channel, global bypass and tuner mute remain session controls. Imported presets apply immediately; click Save preset to retain them. Browser settings can clear local data: export JSON as a portable backup. No cloud synchronization is included.

## Validation

```bash
npm test
npm run check
```

28 Node checks cover pitch at 44.1/48/96 kHz, silence, notes/cents/levels, invalid preset data, and real gate processor code. `/verify.html` provides 11 browser offline-render checks for all eight effects, full board reorder/preset round-trip/global bypass, delay timing and custom WAV IR decoding.

Live hardware and subjective tone must be checked on your own audio interface. Automated file-picker verification of demo import was blocked by the browser test environment; decoding and preset validation have automated coverage.

## V1 limits

- Latency is hardware/OS/browser dependent. The UI shows available output latency estimates, not measured input-to-output latency. Bluetooth is unsuitable for responsive monitoring.
- There is no amp model, native VST/AU hosting or hard output limiter. Extreme boosts can clip; use the meters and master volume.
- Tuner range is 65–1400 Hz, for single notes rather than chords.
- Reordering reconnects the graph and can click during sustained audio. Reorder between phrases.
- Changing reverb decay rebuilds the impulse after a short debounce and can interrupt its tail. Presets are not seamless stage scene switches.
- Microphone access and AudioWorklet require HTTPS or localhost. Mobile audio behavior and device constraints vary.

## Files

`dist/src/pedalboard.js` is the effects library; `gate-worklet.js` is its processor; `dsp.js` provides pure helpers. The `dist/` root contains the playable demo, CSS, controller, guide and browser verification page. `tests/` contains Node checks. Serve `dist/` without a build step. Keep the worklet file alongside the library when bundling or copying it.
