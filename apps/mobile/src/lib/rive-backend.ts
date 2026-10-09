import { RiveRuntime } from "@rive-app/react-native";

// Experiment: the default OpenGL backend draws the Rive pot bowl/drink on an opaque black
// background on Android (transparent on web and in the editor). Falls back to OpenGL itself.
RiveRuntime.setAndroidRenderBackend("vulkan");
