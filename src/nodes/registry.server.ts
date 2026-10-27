// Sinh tự động bởi `npm run gen:nodes` từ các thư mục src/nodes/<loại>/ — không sửa tay.

import { serverNode, type ServerNode } from "../core/node-runtime";
import { definition as generateVideoDefinition } from "./generate-video/definition";
import { run as generateVideoRun } from "./generate-video/run";
import { definition as promptDefinition } from "./prompt/definition";
import { run as promptRun } from "./prompt/run";

export const serverNodes: Record<string, ServerNode> = {
  [generateVideoDefinition.type]: serverNode(generateVideoDefinition, generateVideoRun),
  [promptDefinition.type]: serverNode(promptDefinition, promptRun),
};
