"use strict";

/*
  Prairie Village
  Phase 2 — Sprite Data

  IMPORTANT:
  Every visual asset in this file is currently marked PLACEHOLDER.

  These temporary sprites exist only to prove that the engine can render
  rectangular letter-grid arrays correctly.

  They can later be replaced with approved or canonical letter grids
  without changing the movement or rendering systems in game.js.
*/

/*
  Each letter represents a palette role.

  . = transparent
  K = outline
  E = deepest value
  D = dark value
  M = middle value
  L = light value
  S = brightest limited accent
*/
const PALETTES = {
  /*
    Temporary palette for Mike.
  */
  mikePlaceholder: {
    K: "#302b27",
    E: "#3c332d",
    D: "#5a493b",
    M: "#8f6f55",
    L: "#d1a27b",
    S: "#f1d4ad"
  },

  /*
    Henry is represented as a small white dog with dark ears and tail.
    This remains PLACEHOLDER artwork.
  */
  henryPlaceholder: {
    K: "#292724",
    E: "#34312d",
    D: "#55514b",
    M: "#b8b4aa",
    L: "#dedbd1",
    S: "#f7f4e9"
  },

  /*
    Temporary terrain palette.
  */
  groundPlaceholder: {
    K: "#596346",
    E: "#66734d",
    D: "#76845a",
    M: "#899866",
    L: "#9fad7b",
    S: "#b6c18e"
  },

  /*
    Temporary path palette.
  */
  pathPlaceholder: {
    K: "#777064",
    E: "#81796d",
    D: "#928a7c",
    M: "#a49b8d",
    L: "#b6ad9d",
    S: "#c8beac"
  }
};

/*
  SPRITES contains only data.

  Behavior such as movement and following belongs in game.js.
*/
const SPRITES = {
  /*
    PLACEHOLDER — Mike facing downward.

    The anchor is bottom-center, meaning the bottom middle of the sprite
    is positioned at Mike's world coordinates.
  */
  mikeDown: {
    id: "CHAR_MIKE_DOWN_PLACEHOLDER",
    displayName: "Mike Down",
    status: "PLACEHOLDER",
    anchor: "bottom-center",
    palette: PALETTES.mikePlaceholder,
    grid: [
      "..KKK..",
      ".KSSSK.",
      ".KLM LK".replace(" ", ""),
      ".KMMMMK",
      "..KDK..",
      ".KDDDK.",
      "KDM M DK".replaceAll(" ", ""),
      "..D.D..",
      ".D...D.",
      "KD...DK"
    ]
  },

  /*
    PLACEHOLDER — Mike facing upward.
  */
  mikeUp: {
    id: "CHAR_MIKE_UP_PLACEHOLDER",
    displayName: "Mike Up",
    status: "PLACEHOLDER",
    anchor: "bottom-center",
    palette: PALETTES.mikePlaceholder,
    grid: [
      "..KKK..",
      ".KDDDK.",
      ".KDDDK.",
      ".KMMMMK",
      "..KDK..",
      ".KDDDK.",
      "KDM M DK".replaceAll(" ", ""),
      "..D.D..",
      ".D...D.",
      "KD...DK"
    ]
  },

  /*
    PLACEHOLDER — Mike facing left.
  */
  mikeLeft: {
    id: "CHAR_MIKE_LEFT_PLACEHOLDER",
    displayName: "Mike Left",
    status: "PLACEHOLDER",
    anchor: "bottom-center",
    palette: PALETTES.mikePlaceholder,
    grid: [
      "..KK...",
      ".KSSK..",
      ".KLMSK.",
      ".KMMMK.",
      "..KDK..",
      ".KDDDK.",
      "KDMM.DK",
      "..D.D..",
      ".D...D.",
      "KD...DK"
    ]
  },

  /*
    PLACEHOLDER — Mike facing right.
  */
  mikeRight: {
    id: "CHAR_MIKE_RIGHT_PLACEHOLDER",
    displayName: "Mike Right",
    status: "PLACEHOLDER",
    anchor: "bottom-center",
    palette: PALETTES.mikePlaceholder,
    grid: [
      "...KK..",
      "..KSSK.",
      ".KSMLK.",
      ".KMMMK.",
      "..KDK..",
      ".KDDDK.",
      "KD.MM DK".replaceAll(" ", ""),
      "..D.D..",
      ".D...D.",
      "KD...DK"
    ]
  },

  /*
    PLACEHOLDER — Henry facing downward.
  */
  henryDown: {
    id: "CHAR_HENRY_DOWN_PLACEHOLDER",
    displayName: "Henry Down",
    status: "PLACEHOLDER",
    anchor: "bottom-center",
    palette: PALETTES.henryPlaceholder,
    grid: [
      "K.....K",
      "KKLLLKK",
      ".KLSLK.",
      ".KLLLK.",
      "..KDK..",
      ".KLMLK.",
      "K.L.L.K",
      ".K...K."
    ]
  },

  /*
    PLACEHOLDER — Henry facing upward.
  */
  henryUp: {
    id: "CHAR_HENRY_UP_PLACEHOLDER",
    displayName: "Henry Up",
    status: "PLACEHOLDER",
    anchor: "bottom-center",
    palette: PALETTES.henryPlaceholder,
    grid: [
      "K.....K",
      "KKLLLKK",
      ".KLLLK.",
      ".KLLLK.",
      "..KDK..",
      ".KLMLK.",
      "K.L.L.K",
      ".K...K."
    ]
  },

  /*
    PLACEHOLDER — Henry facing left.
  */
  henryLeft: {
    id: "CHAR_HENRY_LEFT_PLACEHOLDER",
    displayName: "Henry Left",
    status: "PLACEHOLDER",
    anchor: "bottom-center",
    palette: PALETTES.henryPlaceholder,
    grid: [
      "KK.....",
      "KLLKK..",
      "KLSLK..",
      ".KLLLK.",
      "..KMDKK",
      ".KLMLK.",
      "K.L.L.K",
      ".K...K."
    ]
  },

  /*
    PLACEHOLDER — Henry facing right.
  */
  henryRight: {
    id: "CHAR_HENRY_RIGHT_PLACEHOLDER",
    displayName: "Henry Right",
    status: "PLACEHOLDER",
    anchor: "bottom-center",
    palette: PALETTES.henryPlaceholder,
    grid: [
      ".....KK",
      "..KKLLK",
      "..KLSLK",
      ".KLLLK.",
      "KKDMK..",
      ".KLMLK.",
      "K.L.L.K",
      ".K...K."
    ]
  },

  /*
    PLACEHOLDER — one grass tile.

    Unlike characters, this tile uses the top-left anchor because it
    fills a map cell rather than standing on the ground.
  */
  grassTile: {
    id: "TERRAIN_GRASS_PLACEHOLDER",
    displayName: "Grass Tile",
    status: "PLACEHOLDER",
    anchor: "top-left",
    palette: PALETTES.groundPlaceholder,
    grid: [
      "MMMMMMMM",
      "MMLMMMMM",
      "MMMMMDMM",
      "MMMMMMMM",
      "DMMMMMLM",
      "MMMMMMMM",
      "MMMLMMMM",
      "MMMMMMDM"
    ]
  },

  /*
    PLACEHOLDER — one path tile.
  */
  pathTile: {
    id: "TERRAIN_PATH_PLACEHOLDER",
    displayName: "Path Tile",
    status: "PLACEHOLDER",
    anchor: "top-left",
    palette: PALETTES.pathPlaceholder,
    grid: [
      "MMMMMMMM",
      "MMLMMMMM",
      "MMMMMDMM",
      "MMMMMMMM",
      "DMMMMMMM",
      "MMMMMLMM",
      "MMMMMMMM",
      "MMMDMMMM"
    ]
  }
};

/*
  A simple top-down map made from single-character tile codes.

  G = grass
  P = path

  The map is 20 tiles wide and 15 tiles tall.

  Each tile is 16 world pixels in game.js, so the total map size is:

  20 × 16 = 320 pixels wide
  15 × 16 = 240 pixels tall

  That exactly matches the canvas resolution.
*/
const MAP_DATA = [
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "PPPPPPPPPPPPPPPPPPPP",
  "PPPPPPPPPPPPPPPPPPPP",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGG"
];

/*
  Connect each map character to its sprite.

  Future map types can be added here without changing the rendering loop.
*/
const TILE_TYPES = {
  G: SPRITES.grassTile,
  P: SPRITES.pathTile
};