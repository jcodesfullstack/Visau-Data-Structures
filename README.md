# Visau Data Structures

An animation-first data structure visualizer built with plain HTML, CSS, and JavaScript.

The goal of this project is simple: let someone click a demo and actually watch values move through arrays, stacks, queues, linked lists, trees, and common algorithms instead of only reading static diagrams.

## What It Shows

- Arrays with visible index movement
- Stacks with push and pop motion
- Queues with front and back flow
- Linked lists with node and pointer motion
- Binary search trees with branching insertion paths
- Bubble sort and selection sort animations
- Binary search range narrowing

## Running Locally

Because the app uses ES modules, serve it through a local web server instead of opening `index.html` directly.

Example:

```bash
python3 -m http.server 4180
```

Then open:

```text
http://127.0.0.1:4180/index.html
```

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── index.html
├── styles.css
├── src/
│   ├── app.js
│   ├── core/
│   ├── modules/
│   └── renderers/
└── README.md
```

## Main Files

- `index.html`: app shell and UI controls
- `styles.css`: visual design and animation styling
- `src/app.js`: animation-first demo player and scene generation
- `src/modules/`: earlier reusable data-structure logic and helpers
- `src/renderers/`: rendering utilities used during the project evolution

## GitHub Pages

This repo includes a GitHub Actions workflow for GitHub Pages deployment.

Once Pages is enabled in the repository settings, pushes to `main` can deploy the static site automatically.

## Notes

- The current focus is visual learning, not production packaging.
- The app is intentionally framework-free so it stays easy to inspect and share.
