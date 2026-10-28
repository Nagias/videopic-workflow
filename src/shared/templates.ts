import { ShotSchema, type Shot } from "./director";
import type { WorkflowGraph } from "./workflow";

const CHARACTER =
  "an adult Vietnamese woman in her early 20s with ordinary, everyday Vietnamese facial features (not a model), natural bare face without makeup, light sun-tanned skin with a little sweat and dirt, black hair tied back in a slightly messy low ponytail, slim athletic build; she wears a plain dark charcoal sports bra, tight dark olive full-length hiking leggings and brown hiking boots";

const LOCATION =
  "a forested hillside in Son La province in the mountains of northwest Vietnam: a small olive-green dome tent on a flat grassy ledge, a stone campfire ring beside the tent, a clear rocky mountain stream flowing just below the ledge, dense tropical forest and misty limestone mountains behind, soft early-morning light";

const SHOTS: Shot[] = ShotSchema.array().parse([
  { id: "c01", size: "EWS", angle: "aerial", move: "drone", subject: "none", link: "cut", action: "Early morning mist over the forested hillside, the small tent on the ledge and the stream below" },
  { id: "c02", size: "WS", angle: "eye", move: "handheld", subject: "character", link: "cut", action: "She walks up the slope from the stream toward the tent, carrying a small axe and a bundle of dry branches" },
  { id: "c03", size: "MS", angle: "eye", move: "static", subject: "character", link: "cut", action: "She sets a short log upright on a tree stump next to the tent and raises the axe with both hands" },
  { id: "c04", size: "INSERT", angle: "high", move: "static", subject: "none", link: "cut", action: "Close-up of a short firewood log on a tree stump falling apart into two clean halves, fresh pale wood chips scattered on the moss" },
  { id: "c05", size: "MS", angle: "low", move: "handheld", subject: "character", link: "cut", action: "She keeps splitting logs with steady swings, then wipes sweat from her forehead with her forearm" },
  { id: "c06", size: "MS", angle: "low", move: "static", subject: "character", link: "chain", action: "She bends down, gathers the split firewood into her arms and stands up" },
  { id: "c07", size: "CU", angle: "eye", move: "pan", subject: "none", link: "cut", action: "Clear water of the mountain stream flowing over mossy rocks, sunlight sparkling" },
  { id: "c08", size: "MS", angle: "high", move: "static", subject: "character", link: "cut", action: "She kneels by the stone campfire ring beside the tent and arranges dry grass and thin twigs into a small pile" },
  { id: "c09", size: "INSERT", angle: "eye", move: "static", subject: "character", link: "cut", action: "Close on her hands striking a ferro rod, bright sparks fall onto the dry grass" },
  { id: "c10", size: "INSERT", angle: "eye", move: "push_in", subject: "character", link: "chain", action: "A small flame catches in the dry grass, she cups her hands and gently blows on it" },
  { id: "c11", size: "MCU", angle: "eye", move: "push_in", subject: "character", link: "cut", action: "The fire grows, she carefully adds split wood, warm firelight on her face" },
  { id: "c12", size: "WS", angle: "high", move: "pull_out", subject: "character", link: "cut", action: "She sits beside the crackling campfire next to the tent, looking down at the stream as morning mist drifts" },
]);

const SON_LA: WorkflowGraph = {
  nodes: [
    { id: "character-1", type: "character", position: { x: 40, y: 40 }, params: { description: CHARACTER, provider: "muse" } },
    { id: "location-1", type: "location", position: { x: 40, y: 560 }, params: { description: LOCATION, provider: "muse" } },
    { id: "shotlist-1", type: "shotlist", position: { x: 440, y: 40 }, params: { shots: SHOTS } },
    { id: "film-1", type: "film", position: { x: 1020, y: 40 }, params: { provider: "muse", fixBrightness: true } },
  ],
  edges: [
    { id: "e-char-film", source: "character-1", sourceHandle: "character", target: "film-1", targetHandle: "character" },
    { id: "e-loc-film", source: "location-1", sourceHandle: "location", target: "film-1", targetHandle: "location" },
    { id: "e-shots-film", source: "shotlist-1", sourceHandle: "shots", target: "film-1", targetHandle: "shots" },
  ],
};

export const WORKFLOW_TEMPLATES = [{ id: "sinh-ton-son-la", label: "Sinh tồn Sơn La (12 cảnh ~60 giây)", name: "Sinh tồn Sơn La", graph: SON_LA }] as const;

export type TemplateId = (typeof WORKFLOW_TEMPLATES)[number]["id"];
