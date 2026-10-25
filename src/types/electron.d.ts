export {};

declare global {
  interface Window {
    choraleMcp?: import('./mcpIntegration').McpIntegrationBridge;
    choraleAI?: import('../agent/aiTypes').ChoraleAIBridge;
    choraleFiles?: import('./fileBridge').ChoraleFilesBridge;
    choraleScan?: import('./scoreScan').ScoreScanBridge;
  }
}
