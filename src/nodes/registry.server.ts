// Sinh tự động bởi `npm run gen:nodes` từ các thư mục src/nodes/<loại>/ — không sửa tay.

import { serverNode, type ServerNode } from "../core/node-runtime";
import { definition as characterDefinition } from "./character/definition";
import { run as characterRun } from "./character/run";
import { definition as filmDefinition } from "./film/definition";
import { run as filmRun } from "./film/run";
import { definition as generateVideoDefinition } from "./generate-video/definition";
import { run as generateVideoRun } from "./generate-video/run";
import { definition as locationDefinition } from "./location/definition";
import { run as locationRun } from "./location/run";
import { definition as promptDefinition } from "./prompt/definition";
import { run as promptRun } from "./prompt/run";
import { definition as propsDefinition } from "./props/definition";
import { run as propsRun } from "./props/run";
import { definition as shotlistDefinition } from "./shotlist/definition";
import { run as shotlistRun } from "./shotlist/run";
import { definition as writerDefinition } from "./writer/definition";
import { run as writerRun } from "./writer/run";

export const serverNodes: Record<string, ServerNode> = {
  [characterDefinition.type]: serverNode(characterDefinition, characterRun),
  [filmDefinition.type]: serverNode(filmDefinition, filmRun),
  [generateVideoDefinition.type]: serverNode(generateVideoDefinition, generateVideoRun),
  [locationDefinition.type]: serverNode(locationDefinition, locationRun),
  [promptDefinition.type]: serverNode(promptDefinition, promptRun),
  [propsDefinition.type]: serverNode(propsDefinition, propsRun),
  [shotlistDefinition.type]: serverNode(shotlistDefinition, shotlistRun),
  [writerDefinition.type]: serverNode(writerDefinition, writerRun),
};
