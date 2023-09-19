// Import necessary modules and styles
import "./style.css";
import { fromEvent, interval, merge } from "rxjs";
import { map, filter, scan } from "rxjs/operators";

/** Constants */

// Constants related to the canvas and grid
const Viewport = {
  CANVAS_WIDTH: 200,
  CANVAS_HEIGHT: 400,
  PREVIEW_WIDTH: 160,
  PREVIEW_HEIGHT: 80,
} as const;

const Constants = {
  TICK_RATE_MS: 500,
  GRID_WIDTH: 10,
  GRID_HEIGHT: 20,
} as const;

const Block = {
  WIDTH: Viewport.CANVAS_WIDTH / Constants.GRID_WIDTH,
  HEIGHT: Viewport.CANVAS_HEIGHT / Constants.GRID_HEIGHT,
};

// Define different block shapes
const shapes = {
  square: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  line: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
  LShape: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
  reverseLShape: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }],
  TShape: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
  ZShape: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 1 }],
  reverseZShape: [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }],
} as const;

// Define a deterministic random number generator class
class DeterministicRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Generates a random number between 0 and 1 (exclusive).
   * @returns {number} Random number
   */
  random(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
}

// Set a fixed seed for deterministic randomness
const seed = 42;
const rng = new DeterministicRNG(seed);

/** User input */

// Define key codes and events for user input
type Key = "KeyS" | "KeyA" | "KeyD" | "KeyR" | "KeyN";
type Event = "keydown" | "keyup" | "keypress";

/** Utility functions */

/**
 * Creates a random block shape using a given random number generator.
 * @param {DeterministicRNG} rng - Random number generator
 * @returns {Array} Random block shape
 */
const createRandomBlock = (rng: DeterministicRNG) => {
  const blockShapes = [shapes.square, shapes.line, shapes.LShape, shapes.TShape, shapes.ZShape,shapes.reverseLShape,shapes.reverseZShape];
  const randomShape = blockShapes[Math.floor(rng.random() * blockShapes.length)];
  return randomShape;
};

// Define a function to rotate an entire shape (array of points) by an angle
const rotateShape = (s: State) => {
  const currentShape = s.cubePosition;
  const pivot = currentShape[1]; // Use the second block as the pivot point

  // Define a function to rotate a point around a pivot
  const rotatePoint = (point: { x: number; y: number }) => {
    const dx = point.x - pivot.x;
    const dy = point.y - pivot.y;
    const rotatedX = pivot.x - dy;
    const rotatedY = pivot.y + dx;
    return { x: rotatedX, y: rotatedY };
  };

  // Apply the rotatePoint function to all blocks in the current shape
  const rotatedShape = currentShape.map((block) => rotatePoint(block));

  // Check if the rotated shape is valid (not colliding with other blocks or out of bounds)
  const isValidRotation = !checkCollision(rotatedShape, s.fallenBlocks);

  if (isValidRotation) {
    // If the rotation is valid, update the current shape with the rotated shape
    return {
      ...s,
      cubePosition: rotatedShape,
    };
  } else {
    return s;
  }
};

/**
 * Checks if a block can be moved to a new position.
 *
 * @param {Object} block - Block to check
 * @param {Object} moves - User moves
 * @param {Array} fallenBlocks - Array of fallen blocks
 * @returns {boolean} True if the block can be moved, false otherwise
 */
const checkMoveable = (
  block: { x: number; y: number },
  moves: {x: number; y: number},
  fallenBlocks: ReadonlyArray<{ x: number; y: number }>,
): boolean => {

  const outOfGrid = block.x + moves.x < 0 || block.x + moves.x >= Constants.GRID_WIDTH ;

  const newPosition = {
    x: block.x + moves.x,
    y: block.y + moves.y,
  };

  const collides = fallenBlocks.some((fallenBlock) =>
    fallenBlock.x === newPosition.x && fallenBlock.y === newPosition.y
  );
  return collides || outOfGrid;
};

/**
 * Checks if there is a collision between cubePosition and fallenBlocks.
 *
 * @param {Array} cubePosition - Current cube position
 * @param {Array} fallenBlocks - Array of fallen blocks
 * @returns {boolean} True if there is a collision, false otherwise
 */
const checkCollision = (
  cubePosition: ReadonlyArray<{ x: number; y: number }>,
  fallenBlocks: ReadonlyArray<{ x: number; y: number }>,
):boolean => {
  // Check if any block in cubePosition is out of bounds (bottom)
  const outOfBounds = cubePosition.some((block) => block.y >= Constants.GRID_HEIGHT || block.x < 0 || block.x >= Constants.GRID_WIDTH);

  // Check if any block in cubePosition collides with fallenBlocks
  const collides= cubePosition.some((block) =>
    fallenBlocks.some((fallenBlock) =>
      fallenBlock.x === block.x && fallenBlock.y === block.y
    )
  );

  return outOfBounds || collides;
};

/**
 * Finds full rows in fallenBlocks and returns their indices.
 *
 * @param {Array} fallenBlocks - Array of fallen blocks
 * @returns {Array} Array of row indices that are full
 */
const findFullRows = (fallenBlocks: ReadonlyArray<{ x: number; y: number }>): number[] => {
  // Create an array of unique row numbers from fallenBlocks
  const uniqueRows = Array.from(new Set(fallenBlocks.map((block) => block.y)));

  // Filter rows that have a block count equal to the grid width
  const fullRows = uniqueRows.filter((row) =>
    fallenBlocks.filter((block) => block.y === row).length === Constants.GRID_WIDTH
  );

  return fullRows;
}

/** State processing */

// Define the structure of the game state
type State = Readonly<{
  gameEnd: boolean;
  cubePosition: ReadonlyArray<{ x: number; y: number }>;
  fallenBlocks: ReadonlyArray<{ x: number; y: number }>;
  lvl: number,
  score: number;
  highScore: number;
  nextShape: ReadonlyArray<{ x: number; y: number }>
}>;

// Initial game state
const initialState: State = {
  gameEnd: false,
  cubePosition: [{ x: 0, y: -2 },{ x: 0, y: -1 },{ x: 1, y: -2 },{ x: 1, y: -1 }],
  fallenBlocks: [],
  lvl: 1,
  score: 0,
  highScore: 0,
  nextShape: createRandomBlock(rng),
} as const;

/**
 * Updates the game state by proceeding with one time step.
 *
 * @param {State} s - Current state
 * @param {Object | number | string} moves - User moves or actions
 * @returns {State} Updated state
 */
const tick = (s: State, moves: {x: number; y: number} | number | string) => {
  if (s.gameEnd) {
    return s;
  }

  let newBlockPosition = s.cubePosition;

  if (typeof moves === "object") {
    // If moves is an object, apply the specified move
    const canMove = s.cubePosition.some((block) =>
      checkMoveable(block, moves, s.fallenBlocks));

    if (!canMove) {
      newBlockPosition = s.cubePosition.map((block) => ({
        x: block.x + moves.x,
        y: block.y + moves.y,
      }));
    }
  } else {
    // Update the block's position by increasing the y-coordinate
    newBlockPosition = s.cubePosition.map((block) => ({
      x: block.x,
      y: block.y + 1, // Move the block down by 1 unit
    }));
  }
  
  const hasCollision = checkCollision(newBlockPosition, s.fallenBlocks);
  if (!hasCollision) {
    // No collision, update the block's position
    return {
      ...s,
      cubePosition: newBlockPosition,
    };
  }
  const newBlock = s.nextShape.map((block) => ({
    x: block.x,
    y: block.y - 2, // Start at the top
  }));
  const newNextShape = createRandomBlock(rng);
  const newFallenBlocks = [...s.fallenBlocks, ...s.cubePosition];
  const fullRows = findFullRows(newFallenBlocks);
  const filteredBlocks = newFallenBlocks.filter((block) => !fullRows.includes(block.y));
  if (newFallenBlocks.some((block) => block.y < 0)) {
    return {
      ...s,
      gameEnd: true, // Set gameEnd flag to true
      highScore: s.highScore > s.score ? s.highScore : s.score,
    };
  }
  return {
    ...s,
    cubePosition: newBlock,
    fallenBlocks: filteredBlocks.map((block) => ({
      x: block.x,
      y: block.y + fullRows.filter((_) => _ > block.y).length,
    })),
    score: s.score + 10 * fullRows.length, 
    nextShape: newNextShape, 
  };
};



/** Rendering (side effects) */

/**
 * Displays an SVG element on the canvas and brings it to the foreground.
 *
 * @param {SVGGraphicsElement} elem - SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
  elem.setAttribute("visibility", "visible");
  elem.parentNode!.appendChild(elem);
};

/**
 * Hides an SVG element on the canvas.
 *
 * @param {SVGGraphicsElement} elem - SVG element to hide
 */
const hide = (elem: SVGGraphicsElement) =>
  elem.setAttribute("visibility", "hidden");

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param {string | null} namespace - Namespace of the SVG element
 * @param {string} name - SVGElement name
 * @param {Record<string, string>} props - Properties to set on the SVG element
 * @returns {SVGElement} SVG element
 */
const createSvgElement = (
  namespace: string | null,
  name: string,
  props: Record<string, string> = {}
) => {
  const elem = document.createElementNS(namespace, name) as SVGElement;
  Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
  return elem;
};

/**
 * This is the function called on page load. Your main game loop
 * should be called here.
 */
export function main() {
  // Canvas elements
  const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
    HTMLElement;
  const preview = document.querySelector("#svgPreview") as SVGGraphicsElement &
    HTMLElement;
  const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
    HTMLElement;
  const container = document.querySelector("#main") as HTMLElement;

  svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
  svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);
  preview.setAttribute("height", `${Viewport.PREVIEW_HEIGHT}`);
  preview.setAttribute("width", `${Viewport.PREVIEW_WIDTH}`);

  // Text fields
  const levelText = document.querySelector("#levelText") as HTMLElement;
  const scoreText = document.querySelector("#scoreText") as HTMLElement;
  const highScoreText = document.querySelector("#highScoreText") as HTMLElement;

  /** User input */

  // Observable for keyboard events
  const key$ = fromEvent<KeyboardEvent>(document, "keypress");

  // Observables for specific key presses
  const fromKey = (keyCode: Key, moves: {x: number, y: number} | number) =>
    key$.pipe(filter(({ code }) => code === keyCode), map(() => moves));

  const left$ = fromKey("KeyA", { x : -1, y : 0 });
  const right$ = fromKey("KeyD", { x : 1, y : 0 });
  const down$ = fromKey("KeyS", { x : 0, y : 1 });

  // Observable for rotating the shape
  const rotate$ = fromEvent<KeyboardEvent>(document, "keypress")
    .pipe(filter(({ code }) => code === "KeyR"), map(() => "rotate"));

  // Observable for restarting the game
  const restart$ = fromEvent<KeyboardEvent>(document, "keypress")
    .pipe(filter(({ code }) => code === "KeyN"), map(() => "restart"));

  /** Observables */

  /** Determines the rate of time steps */
  const tick$ = interval(Constants.TICK_RATE_MS);

  /**
   * Renders the current state to the canvas.
   *
   * In MVC terms, this updates the View using the Model.
   *
   * @param {State} s - Current state
   */
  const render = (s: State) => {
    
    // Render level, score and highscore
    levelText.textContent = `${s.lvl}`;
    scoreText.textContent = `${s.score}`;
    highScoreText.textContent = `${s.highScore}`;

    // Remove previously rendered cubes
    svg.querySelectorAll("rect").forEach((cube) => {
      if (cube.classList.contains("cube")) {
        cube.remove();
      }
    });

    // Render all fallen blocks
    s.fallenBlocks.forEach((block) => {
      const fallenBlock = createSvgElement(svg.namespaceURI, "rect", {
        height: `${Block.HEIGHT}`,
        width: `${Block.WIDTH}`,
        x: `${block.x * Block.WIDTH}`,
        y: `${block.y * Block.HEIGHT}`,
        style: "fill: yellow",
      });
      fallenBlock.classList.add("cube");
      svg.appendChild(fallenBlock);
    });

    // Render the current cube
    s.cubePosition.forEach((block) => {
      const cube = createSvgElement(svg.namespaceURI, "rect", {
        height: `${Block.HEIGHT}`,
        width: `${Block.WIDTH}`,
        x: `${block.x * Block.WIDTH}`,
        y: `${block.y * Block.HEIGHT}`,
        style: "fill: green",
      });
      cube.classList.add("cube");
      svg.appendChild(cube);
    });

    // Remove previously rendered cubes in the preview
    preview.querySelectorAll("rect").forEach((cube) => {
      if (cube.classList.contains("cube")) {
        cube.remove();
      }
    });

    // Add a block to the preview canvas
    s.nextShape.forEach((block) => {
      const cubePreview = createSvgElement(svg.namespaceURI, "rect", {
        height: `${Block.HEIGHT}`,
        width: `${Block.WIDTH}`,
        x: `${block.x * Block.WIDTH + (Viewport.PREVIEW_WIDTH - Block.WIDTH) / 2}`,
        y: `${block.y * Block.HEIGHT + (Viewport.PREVIEW_HEIGHT - Block.HEIGHT) / 2}`,
        style: "fill: green",
      });
      cubePreview.classList.add("cube");
      preview.appendChild(cubePreview);
    });
  };

  // Merge all relevant observables and scan to update the game state
  const source$ = merge(tick$, left$, right$, down$, rotate$, restart$)
    .pipe(scan((s: State, moves: {x: number, y: number}|number|string) => {
      if (moves === "rotate") {
        return rotateShape(s);
      } else if (moves === "restart") {
        if (s.gameEnd) {
          return { 
            ...initialState, 
            highScore: s.highScore 
        };}
        return { 
          ...s 
        };
      } else {
        return tick(s, moves);
      }
    }, initialState))
    .subscribe((s: State) => {
      render(s);
      if (s.gameEnd) {
        show(gameover);
      } else {
        hide(gameover);
      }
    });
}

// The following simply runs your main function on window load.
if (typeof window !== "undefined") {
  window.onload = () => {
    main();
  };
}
