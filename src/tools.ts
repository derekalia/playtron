// Aggregates all tools following Playwright MCP pattern
import common from './tools/common';
import evaluate from './tools/evaluate';
import keyboard from './tools/keyboard';
import mouse from './tools/mouse';
import navigate from './tools/navigate';
import screenshot from './tools/screenshot';
import snapshot from './tools/snapshot';
import tabs from './tools/tabs';
import wait from './tools/wait';

import type { Tool } from './tools/tool';

export const allTools: Tool<any>[] = [
  ...common,
  ...evaluate,
  ...keyboard,
  ...mouse,
  ...navigate,
  ...screenshot,
  ...snapshot,
  ...tabs,
  ...wait,
];

// Helper to get tools by capability
export function getToolsByCapability(capability: string): Tool<any>[] {
  return allTools.filter(tool => tool.capability === capability);
}

// Helper to get tool by name
export function getToolByName(name: string): Tool<any> | undefined {
  return allTools.find(tool => tool.schema.name === name);
}