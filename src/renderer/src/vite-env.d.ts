/// <reference types="vite/client" />

import type { ArchAgentApi } from "../../shared/types";

declare global {
  interface Window {
    archAgent?: ArchAgentApi;
  }
}
