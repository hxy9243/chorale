export {};

declare global {
  interface Window {
    choraleAI?: import('../agent/aiTypes').ChoraleAIBridge;
    choraleFiles?: import('./fileBridge').ChoraleFilesBridge;
  }
}
