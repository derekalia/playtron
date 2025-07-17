import { z } from 'zod';
import { PlaywrightCDPConnector } from '../playwright-cdp-connector';

export type ToolCapability = 'core' | 'tabs' | 'install' | 'pdf' | 'vision';

export type ToolSchema<Input extends z.ZodType> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Input;
  type: 'readOnly' | 'destructive';
};

export type ToolResult = {
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
};

export type Tool<Input extends z.ZodType = z.ZodType> = {
  capability: ToolCapability;
  schema: ToolSchema<Input>;
  handle: (connector: PlaywrightCDPConnector, params: z.output<Input>) => Promise<ToolResult>;
};

export function defineTool<Input extends z.ZodType>(tool: Tool<Input>): Tool<Input> {
  return tool;
}

// Helper function to create consistent error responses
export function errorResult(message: string): ToolResult {
  return {
    content: [{
      type: 'text',
      text: `Error: ${message}`
    }]
  };
}

// Helper function to create consistent success responses
export function successResult(message: string): ToolResult {
  return {
    content: [{
      type: 'text',
      text: message
    }]
  };
}