export type SeedTopic = {
  title: string;
  research_context: string;
};

import { canvasCenter } from "./seeds/canvas-center.js";
import { canvasArea } from "./seeds/canvas-area.js";
import { canvasBase } from "./seeds/canvas-base.js";
import { canvasStation } from "./seeds/canvas-station.js";
import { clinicPlaybook } from "./seeds/clinic-playbook.js";

export const SEEDS: [string, string, SeedTopic[]][] = [
  canvasCenter,
  canvasArea,
  canvasBase,
  canvasStation,
  clinicPlaybook,
];
