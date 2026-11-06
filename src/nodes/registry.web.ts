// Sinh tự động bởi `npm run gen:nodes` từ các thư mục src/nodes/<loại>/ — không sửa tay.

import { webNode, type WebNode } from "../features/editor/ui/node-kit";
import { definition as castDefinition } from "./cast/definition";
import { CastView } from "./cast/view";
import { definition as characterDefinition } from "./character/definition";
import { CharacterView } from "./character/view";
import { definition as filmDefinition } from "./film/definition";
import { FilmView } from "./film/view";
import { definition as filmCombineDefinition } from "./film-combine/definition";
import { FilmCombineView } from "./film-combine/view";
import { definition as generateVideoDefinition } from "./generate-video/definition";
import { GenerateVideoView } from "./generate-video/view";
import { definition as ideasDefinition } from "./ideas/definition";
import { IdeasView } from "./ideas/view";
import { definition as locationDefinition } from "./location/definition";
import { LocationView } from "./location/view";
import { definition as outlineDefinition } from "./outline/definition";
import { OutlineView } from "./outline/view";
import { definition as promptDefinition } from "./prompt/definition";
import { PromptView } from "./prompt/view";
import { definition as propsDefinition } from "./props/definition";
import { PropsView } from "./props/view";
import { definition as sceneDefinition } from "./scene/definition";
import { SceneView } from "./scene/view";
import { definition as shotlistDefinition } from "./shotlist/definition";
import { ShotListView } from "./shotlist/view";
import { definition as writerDefinition } from "./writer/definition";
import { WriterView } from "./writer/view";

export const webNodes: Record<string, WebNode> = {
  [castDefinition.type]: webNode(castDefinition, CastView),
  [characterDefinition.type]: webNode(characterDefinition, CharacterView),
  [filmDefinition.type]: webNode(filmDefinition, FilmView),
  [filmCombineDefinition.type]: webNode(filmCombineDefinition, FilmCombineView),
  [generateVideoDefinition.type]: webNode(generateVideoDefinition, GenerateVideoView),
  [ideasDefinition.type]: webNode(ideasDefinition, IdeasView),
  [locationDefinition.type]: webNode(locationDefinition, LocationView),
  [outlineDefinition.type]: webNode(outlineDefinition, OutlineView),
  [promptDefinition.type]: webNode(promptDefinition, PromptView),
  [propsDefinition.type]: webNode(propsDefinition, PropsView),
  [sceneDefinition.type]: webNode(sceneDefinition, SceneView),
  [shotlistDefinition.type]: webNode(shotlistDefinition, ShotListView),
  [writerDefinition.type]: webNode(writerDefinition, WriterView),
};
