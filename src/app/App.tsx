import { ReactFlowProvider } from "@xyflow/react";
import { Editor } from "../features/editor/ui/Editor";

export function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
