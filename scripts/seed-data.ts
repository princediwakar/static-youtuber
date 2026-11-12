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
  ['The Case File', 'canvas_center', canvasCenter[2]],
  ['The Case File', 'canvas_area', canvasArea[2]],
  ['The Case File', 'canvas_base', canvasBase[2]],
  ['The Case File', 'canvas_station', canvasStation[2]],
  ['The Case File', 'clinic_playbook', clinicPlaybook[2]],
];
