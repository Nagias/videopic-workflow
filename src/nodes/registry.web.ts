// Sinh tự động bởi `npm run gen:nodes` từ các thư mục src/nodes/<loại>/ — không sửa tay.

import { webNode, type WebNode } from "../features/editor/ui/node-kit";
import { definition as generateVideoDefinition } from "./generate-video/definition";
import { GenerateVideoView } from "./generate-video/view";
import { definition as promptDefinition } from "./prompt/definition";
import { PromptView } from "./prompt/view";

export const webNodes: Record<string, WebNode> = {
  [generateVideoDefinition.type]: webNode(generateVideoDefinition, GenerateVideoView),
  [promptDefinition.type]: webNode(promptDefinition, PromptView),
};
