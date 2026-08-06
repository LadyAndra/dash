"use strict";

/*
  Prairie Village
  Phase 2.2 — Invisible Floating Mobile Controls

  This file contains:

  1. Canvas setup
  2. Letter-grid sprite rendering
  3. Map rendering
  4. Keyboard input
  5. Invisible left-half floating joystick input
  6. Invisible right-half action input
  7. Mike movement
  8. Full-sprite map-boundary collision
  9. Henry's delayed following
  10. Stable Henry directional facing
  11. The animation loop

  It intentionally does not yet contain:

  - houses
  - trees
  - rabbits
  - gardening
  - crafting
  - saving
  - audio
  - PWA registration
*/

/* ------------------------------------------------------------------ */
/* Canvas and control setup                                            */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById("game-canvas");
const context = canvas.getContext("2d");

const joystickZone = document.getElementById("joystick-zone");
const actionZone = document.getElementById("action-zone");

context.imageSmoothingEnabled = false;
canvas.tabIndex = 0;

window.addEventListener("load", () => {
  canvas.focus();
});

/* ------------------------------------------------------------------ */
/* World measurements                                                  */
/* ------------------------------------------------------------------ */

const TILE_SIZE = 16;
const CHARACTER_CELL_SCALE = 2;
const TERRAIN_CELL_SCALE = 2;
const WORLD_WIDTH = canvas.width;
const WORLD_HEIGHT = canvas.height;

/* ------------------------------------------------------------------ */
/* Game state                                                          */
/* ------------------------------------------------------------------ */

const gameState = {
  previousFrameTime: 0,

  mike: {
    x: 80,
    y: 128,
    speed: 72,
    direction: "down",
    moving: false
  },

  henry: {
    x: 54,
    y: 132,
    direction: "right",

    /*
      Henry remembers whether he is currently using a horizontal or
      vertical sprite.

      Near a diagonal, he keeps the current axis instead of changing
      direction every frame.
    */
    facingAxis: "horizontal"
  },

  mikePositionHistory: [],
  henryDelayMilliseconds: 280
};

/* ------------------------------------------------------------------ */
/* Shared input state                                                  */
/* ------------------------------------------------------------------ */

const input = {
  up: false,
  down: false,
  left: false,
  right: false,

  /*
    Floating joystick values range from -1 to 1.
  */
  joystickX: 0,
  joystickY: 0,

  /*
    The action input is ready for a future interaction system.
  */
  action: false
};

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/* ------------------------------------------------------------------ */
/* Keyboard input                                                      */
/* ------------------------------------------------------------------ */

function setKeyState(key, isPressed) {
  const normalizedKey = key.toLowerCase();

  if (normalizedKey === "arrowup" || normalizedKey === "w") {
    input.up = isPressed;
  }

  if (normalizedKey === "arrowdown" || normalizedKey === "s") {
    input.down = isPressed;
  }

  if (normalizedKey === "arrowleft" || normalizedKey === "a") {
    input.left = isPressed;
  }

  if (normalizedKey === "arrowright" || normalizedKey === "d") {
    input.right = isPressed;
  }
}

function isMovementKey(key) {
  return [
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    "w",
    "a",
    "s",
    "d"
  ].includes(key.toLowerCase());
}

function setActionState(isPressed) {
  input.action = isPressed;

  if (actionZone) {
    actionZone.setAttribute("aria-pressed", String(isPressed));
  }
}

window.addEventListener("keydown", (event) => {
  if (isMovementKey(event.key)) {
    event.preventDefault();
    setKeyState(event.key, true);
  }

  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    setActionState(true);
  }
});

window.addEventListener("keyup", (event) => {
  if (isMovementKey(event.key)) {
    event.preventDefault();
    setKeyState(event.key, false);
  }

  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    setActionState(false);
  }
});

/* ------------------------------------------------------------------ */
/* Invisible floating joystick                                        */
/* ------------------------------------------------------------------ */

const joystickState = {
  activePointerId: null,
  originX: 0,
  originY: 0
};

/*
  The joystick radius is measured in screen pixels because pointer
  coordinates are screen coordinates.

  This value remains comfortable across different phone sizes while
  still allowing full movement without requiring a large thumb motion.
*/
function getJoystickRadius() {
  const zoneRectangle = joystickZone.getBoundingClientRect();

  return clamp(
    Math.min(zoneRectangle.width, zoneRectangle.height) * 0.28,
    38,
    72
  );
}

function resetJoystick() {
  joystickState.activePointerId = null;
  input.joystickX = 0;
  input.joystickY = 0;
}

/*
  Convert the thumb's movement away from its original touch point into
  analog input.

  The first touch location is the invisible joystick center.
*/
function updateJoystickFromPointer(event) {
  const differenceX = event.clientX - joystickState.originX;
  const differenceY = event.clientY - joystickState.originY;

  const distance = Math.hypot(differenceX, differenceY);
  const maximumRadius = getJoystickRadius();
  const deadZone = maximumRadius * 0.12;

  if (distance <= deadZone) {
    input.joystickX = 0;
    input.joystickY = 0;
    return;
  }

  /*
    Remove the dead zone smoothly instead of causing movement to jump
    abruptly from zero.
  */
  const usableDistance = maximumRadius - deadZone;
  const adjustedDistance = Math.min(
    Math.max(distance - deadZone, 0),
    usableDistance
  );

  const strength =
    usableDistance > 0 ? adjustedDistance / usableDistance : 0;

  const directionX = differenceX / distance;
  const directionY = differenceY / distance;

  input.joystickX = directionX * strength;
  input.joystickY = directionY * strength;
}

joystickZone.addEventListener("pointerdown", (event) => {
  if (joystickState.activePointerId !== null) {
    return;
  }

  event.preventDefault();

  joystickState.activePointerId = event.pointerId;
  joystickState.originX = event.clientX;
  joystickState.originY = event.clientY;

  joystickZone.setPointerCapture(event.pointerId);

  /*
    The first touch establishes the center, so movement begins at zero.
  */
  input.joystickX = 0;
  input.joystickY = 0;
});

joystickZone.addEventListener("pointermove", (event) => {
  if (event.pointerId !== joystickState.activePointerId) {
    return;
  }

  event.preventDefault();
  updateJoystickFromPointer(event);
});

function finishJoystickPointer(event) {
  if (event.pointerId !== joystickState.activePointerId) {
    return;
  }

  event.preventDefault();

  if (joystickZone.hasPointerCapture(event.pointerId)) {
    joystickZone.releasePointerCapture(event.pointerId);
  }

  resetJoystick();
}

joystickZone.addEventListener("pointerup", finishJoystickPointer);
joystickZone.addEventListener("pointercancel", finishJoystickPointer);

joystickZone.addEventListener("lostpointercapture", (event) => {
  if (
    joystickState.activePointerId === null ||
    event.pointerId === joystickState.activePointerId
  ) {
    resetJoystick();
  }
});

/* ------------------------------------------------------------------ */
/* Invisible right-half action control                                 */
/* ------------------------------------------------------------------ */

const actionState = {
  activePointerId: null
};

actionZone.addEventListener("pointerdown", (event) => {
  if (actionState.activePointerId !== null) {
    return;
  }

  event.preventDefault();

  actionState.activePointerId = event.pointerId;
  actionZone.setPointerCapture(event.pointerId);
  setActionState(true);
});

function finishActionPointer(event) {
  if (event.pointerId !== actionState.activePointerId) {
    return;
  }

  event.preventDefault();

  if (actionZone.hasPointerCapture(event.pointerId)) {
    actionZone.releasePointerCapture(event.pointerId);
  }

  actionState.activePointerId = null;
  setActionState(false);
}

actionZone.addEventListener("pointerup", finishActionPointer);
actionZone.addEventListener("pointercancel", finishActionPointer);

actionZone.addEventListener("lostpointercapture", (event) => {
  if (
    actionState.activePointerId === null ||
    event.pointerId === actionState.activePointerId
  ) {
    actionState.activePointerId = null;
    setActionState(false);
  }
});

/*
  Prevent synthetic clicks after touch interactions.
*/
actionZone.addEventListener("click", (event) => {
  event.preventDefault();
});

/*
  Clear all held inputs if the browser loses focus.
*/
window.addEventListener("blur", () => {
  input.up = false;
  input.down = false;
  input.left = false;
  input.right = false;

  resetJoystick();

  actionState.activePointerId = null;
  setActionState(false);
});

/* ------------------------------------------------------------------ */
/* Letter-grid sprite measurements                                     */
/* ------------------------------------------------------------------ */

function getSpritePixelSize(sprite, cellScale) {
  const gridHeight = sprite.grid.length;
  const gridWidth = sprite.grid[0].length;

  return {
    width: gridWidth * cellScale,
    height: gridHeight * cellScale
  };
}

/* ------------------------------------------------------------------ */
/* Letter-grid sprite rendering                                        */
/* ------------------------------------------------------------------ */

function drawLetterGridSprite(sprite, worldX, worldY, cellScale) {
  const grid = sprite.grid;
  const palette = sprite.palette;
  const spriteSize = getSpritePixelSize(sprite, cellScale);

  let drawX = worldX;
  let drawY = worldY;

  if (sprite.anchor === "bottom-center") {
    drawX = Math.round(worldX - spriteSize.width / 2);
    drawY = Math.round(worldY - spriteSize.height);
  } else {
    drawX = Math.round(worldX);
    drawY = Math.round(worldY);
  }

  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex];

    for (
      let columnIndex = 0;
      columnIndex < row.length;
      columnIndex += 1
    ) {
      const letter = row[columnIndex];

      if (letter === ".") {
        continue;
      }

      const color = palette[letter];

      if (!color) {
        console.warn(
          `Sprite "${sprite.id}" uses undefined palette role "${letter}".`
        );
        continue;
      }

      context.fillStyle = color;

      context.fillRect(
        drawX + columnIndex * cellScale,
        drawY + rowIndex * cellScale,
        cellScale,
        cellScale
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Map rendering                                                       */
/* ------------------------------------------------------------------ */

function drawMap() {
  for (let rowIndex = 0; rowIndex < MAP_DATA.length; rowIndex += 1) {
    const mapRow = MAP_DATA[rowIndex];

    for (
      let columnIndex = 0;
      columnIndex < mapRow.length;
      columnIndex += 1
    ) {
      const tileCode = mapRow[columnIndex];
      const tileSprite = TILE_TYPES[tileCode];

      if (!tileSprite) {
        console.warn(`Unknown map tile code: "${tileCode}"`);
        continue;
      }

      const tileX = columnIndex * TILE_SIZE;
      const tileY = rowIndex * TILE_SIZE;

      drawLetterGridSprite(
        tileSprite,
        tileX,
        tileY,
        TERRAIN_CELL_SCALE
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Mike movement                                                       */
/* ------------------------------------------------------------------ */

function getMovementVector() {
  let x = input.joystickX;
  let y = input.joystickY;

  if (input.left) {
    x -= 1;
  }

  if (input.right) {
    x += 1;
  }

  if (input.up) {
    y -= 1;
  }

  if (input.down) {
    y += 1;
  }

  const length = Math.hypot(x, y);

  if (length > 1) {
    x /= length;
    y /= length;
  }

  return { x, y };
}

function updateMikeDirection(movement) {
  if (Math.abs(movement.x) > Math.abs(movement.y)) {
    gameState.mike.direction =
      movement.x < 0 ? "left" : "right";
  } else if (Math.abs(movement.y) > 0.01) {
    gameState.mike.direction =
      movement.y < 0 ? "up" : "down";
  }
}

/* ------------------------------------------------------------------ */
/* Directional sprite selection                                        */
/* ------------------------------------------------------------------ */

function getMikeSprite() {
  switch (gameState.mike.direction) {
    case "up":
      return SPRITES.mikeUp;

    case "left":
      return SPRITES.mikeLeft;

    case "right":
      return SPRITES.mikeRight;

    case "down":
    default:
      return SPRITES.mikeDown;
  }
}

function getHenrySprite() {
  switch (gameState.henry.direction) {
    case "up":
      return SPRITES.henryUp;

    case "left":
      return SPRITES.henryLeft;

    case "right":
      return SPRITES.henryRight;

    case "down":
    default:
      return SPRITES.henryDown;
  }
}

/* ------------------------------------------------------------------ */
/* Full-sprite map-boundary collision                                  */
/* ------------------------------------------------------------------ */

function getMikeMapBoundaries() {
  const mikeSprite = getMikeSprite();

  const spriteSize = getSpritePixelSize(
    mikeSprite,
    CHARACTER_CELL_SCALE
  );

  const halfSpriteWidth = spriteSize.width / 2;

  return {
    minimumX: halfSpriteWidth,
    maximumX: WORLD_WIDTH - halfSpriteWidth,
    minimumY: spriteSize.height,
    maximumY: WORLD_HEIGHT - 1
  };
}

function updateMike(deltaSeconds) {
  const movement = getMovementVector();
  const mike = gameState.mike;

  mike.moving =
    Math.abs(movement.x) > 0.01 ||
    Math.abs(movement.y) > 0.01;

  if (!mike.moving) {
    return;
  }

  updateMikeDirection(movement);

  const proposedX =
    mike.x + movement.x * mike.speed * deltaSeconds;

  const proposedY =
    mike.y + movement.y * mike.speed * deltaSeconds;

  const boundaries = getMikeMapBoundaries();

  mike.x = clamp(
    proposedX,
    boundaries.minimumX,
    boundaries.maximumX
  );

  mike.y = clamp(
    proposedY,
    boundaries.minimumY,
    boundaries.maximumY
  );
}

/* ------------------------------------------------------------------ */
/* Henry delayed following                                             */
/* ------------------------------------------------------------------ */

function recordMikePosition(currentTime) {
  gameState.mikePositionHistory.push({
    time: currentTime,
    x: gameState.mike.x,
    y: gameState.mike.y,
    direction: gameState.mike.direction
  });

  const oldestUsefulTime =
    currentTime - gameState.henryDelayMilliseconds - 1000;

  while (
    gameState.mikePositionHistory.length > 2 &&
    gameState.mikePositionHistory[0].time < oldestUsefulTime
  ) {
    gameState.mikePositionHistory.shift();
  }
}

function findDelayedMikePosition(currentTime) {
  const targetTime =
    currentTime - gameState.henryDelayMilliseconds;

  let delayedPosition = null;

  for (const position of gameState.mikePositionHistory) {
    if (position.time <= targetTime) {
      delayedPosition = position;
    } else {
      break;
    }
  }

  return delayedPosition;
}

/*
  Update Henry's facing direction without diagonal flicker.

  Switching axes requires the new axis to be clearly stronger than the
  current one. Near a diagonal, Henry keeps the axis he already has.

  This is a small form of hysteresis: the threshold for switching is
  intentionally stronger than the threshold for staying.
*/
function updateHenryDirection(
  differenceX,
  differenceY,
  delayedDirection
) {
  const henry = gameState.henry;

  const absoluteX = Math.abs(differenceX);
  const absoluteY = Math.abs(differenceY);

  const minimumMovement = 0.01;
  const switchRatio = 1.25;

  if (
    absoluteX < minimumMovement &&
    absoluteY < minimumMovement
  ) {
    henry.direction = delayedDirection;

    henry.facingAxis =
      delayedDirection === "left" ||
      delayedDirection === "right"
        ? "horizontal"
        : "vertical";

    return;
  }

  if (henry.facingAxis === "horizontal") {
    /*
      Stay horizontal unless vertical movement is clearly stronger.
    */
    if (absoluteY > absoluteX * switchRatio) {
      henry.facingAxis = "vertical";
    }
  } else {
    /*
      Stay vertical unless horizontal movement is clearly stronger.
    */
    if (absoluteX > absoluteY * switchRatio) {
      henry.facingAxis = "horizontal";
    }
  }

  if (henry.facingAxis === "horizontal") {
    if (absoluteX >= minimumMovement) {
      henry.direction =
        differenceX < 0 ? "left" : "right";
    } else {
      henry.direction = delayedDirection;
    }
  } else if (absoluteY >= minimumMovement) {
    henry.direction =
      differenceY < 0 ? "up" : "down";
  } else {
    henry.direction = delayedDirection;
  }
}

function updateHenry(currentTime, deltaSeconds) {
  const delayedPosition = findDelayedMikePosition(currentTime);

  if (!delayedPosition) {
    return;
  }

  const henry = gameState.henry;

  const differenceX = delayedPosition.x - henry.x;
  const differenceY = delayedPosition.y - henry.y;
  const distance = Math.hypot(differenceX, differenceY);

  if (distance < 0.5) {
    henry.x = delayedPosition.x;
    henry.y = delayedPosition.y;
    henry.direction = delayedPosition.direction;

    henry.facingAxis =
      delayedPosition.direction === "left" ||
      delayedPosition.direction === "right"
        ? "horizontal"
        : "vertical";

    return;
  }

  const henrySpeed = 86;
  const maximumStep = henrySpeed * deltaSeconds;
  const step = Math.min(maximumStep, distance);

  henry.x += (differenceX / distance) * step;
  henry.y += (differenceY / distance) * step;

  updateHenryDirection(
    differenceX,
    differenceY,
    delayedPosition.direction
  );
}

/* ------------------------------------------------------------------ */
/* Scene rendering                                                     */
/* ------------------------------------------------------------------ */

function drawCharacters() {
  const characters = [
    {
      x: gameState.henry.x,
      y: gameState.henry.y,
      sprite: getHenrySprite()
    },
    {
      x: gameState.mike.x,
      y: gameState.mike.y,
      sprite: getMikeSprite()
    }
  ];

  characters.sort((firstCharacter, secondCharacter) => {
    return firstCharacter.y - secondCharacter.y;
  });

  for (const character of characters) {
    drawLetterGridSprite(
      character.sprite,
      character.x,
      character.y,
      CHARACTER_CELL_SCALE
    );
  }
}

function renderGame() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  drawMap();
  drawCharacters();
}

/* ------------------------------------------------------------------ */
/* Main game loop                                                      */
/* ------------------------------------------------------------------ */

function gameLoop(currentTime) {
  if (gameState.previousFrameTime === 0) {
    gameState.previousFrameTime = currentTime;
  }

  let deltaSeconds =
    (currentTime - gameState.previousFrameTime) / 1000;

  deltaSeconds = Math.min(deltaSeconds, 0.05);
  gameState.previousFrameTime = currentTime;

  updateMike(deltaSeconds);
  recordMikePosition(currentTime);
  updateHenry(currentTime, deltaSeconds);
  renderGame();

  requestAnimationFrame(gameLoop);
}

gameState.mikePositionHistory.push({
  time: performance.now(),
  x: gameState.mike.x,
  y: gameState.mike.y,
  direction: gameState.mike.direction
});

requestAnimationFrame(gameLoop);