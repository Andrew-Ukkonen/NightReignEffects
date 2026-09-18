# Nightreign Buff Stacking

A filterable reference of every named special effect in Elden Ring Nightreign's
`SpEffectParam` table, with the engine field that decides stacking behavior
(`spCategory`). Search by effect, weapon type, source, or stacking rule, and
click any category number to see the full exclusivity group a buff belongs to.

Live site: https://andrew-ukkonen.github.io/NightReignEffects/

## Development

```sh
npm install
npm run dev
```

Built with React + Vite. Pushes to `main` deploy automatically to GitHub Pages
via the workflow in `.github/workflows/deploy.yml`.

## Data

`src/data.js` holds the decoded dataset: `regulation.bin` unpacked with
WitchyBND, `SpEffectParam` decoded against the Nightreign paramdef, with
community names from the Smithbox/Paramdex project. See the "Method & data
notes" section on the site for details.
