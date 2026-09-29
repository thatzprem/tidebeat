# Tidebeat Race

A Three.js catamaran rhythm-rowing time trial. Single-file game (`index.html`); row to the beat, catch the wind, and steer your crew to the finish.

This is a fan-made, non-commercial personal project. It is not affiliated with, endorsed by, or sponsored by any film, studio, or rights holder.

## Controls

- `SPACE` / tap — row to the beat
- `←` / `→` or `A` / `D` — steer
- `↑` / `↓` or `W` / `S` — trim sail

## Sailing (prototype)

The wind blows from ahead, so the course is upwind. The sail only draws when you
are more than ~35° off the wind and the sail is trimmed near the optimal angle for
the wind; drive peaks on a broad reach and drops to nothing "in irons". Rowing on
the beat is a supplement.

The gates are in a straight line down the centre of the course, 24 m wide. A gate
only checks where you are at the moment you cross its line, so you can sail anywhere
between gates. The skill is timing your tacks so you cross each gate line near the
centre.

Aids (top-right panel and the minimap, bottom-right):

- **Trim hint** — which key moves the sail toward its best angle for the current wind.
- **Steering hint** — which way to turn when in irons, and `TACK NOW` when you reach a layline.
- **Minimap** — next gates, finish, your trail, the wind, the no-go fan (red), your two
  close-hauled headings (dashed green) and the next gate's **laylines** (yellow). Sail out
  to a yellow line, tack onto it, and follow it to lay the gate.

## Testing

`verify.js` drives the game headlessly via `window.__test` using Playwright:

```
npm test
```
