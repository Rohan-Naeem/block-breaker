# Block Breaker

A brick breaker game. Pure HTML, CSS and JavaScript. No libraries, no image files.
(It loads two Google Fonts, Bungee and Nunito. If they cannot load, it falls back to system fonts.)

## How to run it

**Quickest:** double-click `index.html`.

**In Antigravity (or VS Code):** open the `block-breaker` folder, run `npx serve` in a terminal, and open the link it prints.

## Features

- **Two modes:** Classic (8 hand-made levels, then endless generated levels that get harder) and Endless (new rows drop from the top).
- **Three difficulties:** Easy, Normal, Hard (lives, ball speed, paddle size, power-up chance). Your last choice is remembered, and the menu shows your best score.
- **Bricks:** glossy gem bricks, strong bricks (metal frame, dots = hits, cracks), steel (cannot break), bomb (explodes neighbors).
- **Power-ups:** Wide paddle, Twin ball (2 balls), Multi-ball (3 balls), Slow ball, Fireball, Laser, Catch (sticky) ball, Giant ball, Bomb ball, Double score, Safety net, Extra life, and one bad one (Shrink).
- **Combo score multiplier**, best score saved per mode and difficulty, sound made with code, pause, mute, full screen.
- **How to play popup** at the start of every game. The text changes for touch devices and desktop.
- **Works everywhere:**
  - Desktop: mouse, or arrow keys / A D. Click or Space to launch and shoot. P or Esc to pause.
  - Phone and tablet: drag to move, tap to launch and shoot. Portrait or landscape.
  - The game box is always 3:4 and fits the screen height. The picture stays sharp on high-resolution screens.

## Files

| File | What it does |
|------|--------------|
| `index.html` | The page: menu, how-to-play popup, pause, level clear, game over, and the "how to play" text (good for SEO) |
| `css/style.css` | Colors (at the top, in `:root`), buttons, screens, mobile layout |
| `js/game.js` | The whole game. Sections are numbered 1 to 7 |
| `icon.svg` | The small icon shown in the browser tab |
| `robots.txt`, `sitemap.xml` | For search engines. Replace `YOUR-DOMAIN` after you publish |

## Easy things to change (all in `js/game.js`)

- **Difficulty numbers:** `DIFFS` in section 1 (lives, ball speed, paddle width, power-up drop chance, Endless row timing).
- **Power-ups:** `POWER` (colors, letters, names, how many seconds). `GOOD` decides which ones drop and how often (more entries = more common).
- **Levels:** `LEVELS` in section 2. Each level is rows of 10 characters:
  `.` empty, `1` `2` `3` = hits needed, `S` = steel, `X` = bomb. Add a new row of strings to add a level.
- **Brick colors:** `ROW_COLORS` (one color per row).
- **Menu text:** `MODE_TEXT`, and the `<section id="menu">` in `index.html`.
- **Ball size and paddle position:** `BALL_R`, `PADDLE_Y`, `PADDLE_H` in section 1.

## Put it online

Upload the whole folder (keep the structure) to any hosting: your WordPress hosting (as a subfolder), Netlify, Vercel, or GitHub Pages.

## Before you publish (SEO checklist)

1. In `index.html`, change `<title>` and `<meta name="description">` to your real keyword (for example "Brick Breaker Game").
2. Remove the comment markers around the three lines that say `AFTER YOU PUBLISH` and put your real address in them (`canonical`, `og:url`, `og:image`). For `og:image`, make a 1200x630 picture of the game (a screenshot works) and upload it as `share.png`.
3. In `robots.txt` and `sitemap.xml`, replace `YOUR-DOMAIN` with your real address.
4. Keep the text under the game (modes, controls, power-ups table, questions). Search engines read text, not the canvas. The structured data (JSON-LD) in the page head matches this text, so if you change the questions, change both.
5. After publishing, add your site to Google Search Console and submit `sitemap.xml`.
