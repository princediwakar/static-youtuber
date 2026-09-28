export type SeedTopic = {
  title: string;
  research_context: string;
};

import { canvasArea } from "./seeds/canvas-area.js";

const allTopics = canvasArea[2];
const chunkSize = Math.floor(allTopics.length / 4);

export const SEEDS: [string, string, SeedTopic[]][] = [
  ['The Case File', 'canvas_center', allTopics.slice(0, chunkSize)],
  ['The Case File', 'canvas_area', allTopics.slice(chunkSize, chunkSize * 2)],
  ['The Case File', 'canvas_base', allTopics.slice(chunkSize * 2, chunkSize * 3)],
  ['The Case File', 'canvas_station', allTopics.slice(chunkSize * 3)],
  // Also add PascalCase versions just in case the DB has PascalCase
  ['The Case File', 'CanvasCenter', allTopics.slice(0, chunkSize)],
  ['The Case File', 'CanvasSquare', allTopics.slice(chunkSize, chunkSize * 2)],
  ['The Case File', 'CanvasBase', allTopics.slice(chunkSize * 2, chunkSize * 3)],
  ['The Case File', 'CanvasStation', allTopics.slice(chunkSize * 3)],
];
