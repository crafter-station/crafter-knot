import wgsl from "@vgpu/wgsl/loader-vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [wgsl()] });
