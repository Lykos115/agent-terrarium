import type { Agent, Specialty } from "../types";
import { spriteIdToColor } from "../modules/sprite-engine";

export interface OfficeTheme {
  name: string;
  accent: string;
  wall: string;
  floor: string;
  bed: string;
  prop: string;
  mood: string;
}

const THEMES: Record<Specialty, OfficeTheme> = {
  "Code Reviewer": {
    name: "Cyber Review Bay",
    accent: "#65f6ff",
    wall: "#101a33",
    floor: "#121427",
    bed: "#314162",
    prop: "security panels",
    mood: "cool monitors, code rails, quiet blue glow",
  },
  Debugger: {
    name: "Bug Hunt Lab",
    accent: "#ffcf5f",
    wall: "#1d1729",
    floor: "#181222",
    bed: "#514131",
    prop: "diagnostic scopes",
    mood: "amber warnings, traces, tool racks",
  },
  DevOps: {
    name: "Ops Rack",
    accent: "#7cffb5",
    wall: "#0d221e",
    floor: "#0f1918",
    bed: "#2d4a42",
    prop: "server cabinet",
    mood: "status lights, servers, cable runs",
  },
  Researcher: {
    name: "Research Nook",
    accent: "#9cc7ff",
    wall: "#17213a",
    floor: "#121928",
    bed: "#394766",
    prop: "maps and notes",
    mood: "papers, shelves, reference boards",
  },
  "Spec Griller": {
    name: "Spec War Room",
    accent: "#ff70a8",
    wall: "#281325",
    floor: "#1b111d",
    bed: "#55304f",
    prop: "whiteboard",
    mood: "pink planning lines, review wall, pressure lamp",
  },
  "Creative Writer": {
    name: "Story Studio",
    accent: "#ffc86f",
    wall: "#302033",
    floor: "#221726",
    bed: "#6a4a53",
    prop: "books and lamp",
    mood: "warm posters, notes, cozy clutter",
  },
  "General Chat": {
    name: "Lively Lounge",
    accent: "#b38cff",
    wall: "#211942",
    floor: "#17132d",
    bed: "#4d3d7d",
    prop: "plants and posters",
    mood: "friendly colors, plants, open desk",
  },
};

export function themeForAgent(agent: Agent): OfficeTheme {
  return THEMES[agent.specialty];
}

export function agentColor(agent: Agent): string {
  return `#${spriteIdToColor(agent.spriteId).toString(16).padStart(6, "0")}`;
}
