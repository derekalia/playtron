import { z } from 'zod';
import { defineTool } from './tool';
import { elementReferences } from './mouse';

const snapshot = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_snapshot',
    title: 'Page snapshot',
    description: 'Capture accessibility snapshot of the current page, this is better than screenshot',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional. Specific tab ID to snapshot. Defaults to active tab.')
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_snapshot called${params.tabId ? ` (tab: ${params.tabId})` : ''}`);
    try {
      const page = await connector.getPage(params.tabId);
      if (!page) {
        throw new Error('No page connected');
      }
      
      console.error('[MCP-CDP] Getting page structure...');
      
      // Clear previous element references
      elementReferences.clear();
      
      // Get structured page snapshot
      const url = page.url();
      const title = await page.title();
      const structure = await getPageSnapshot(connector);
      
      console.error('[MCP-CDP] Formatting snapshot...');
      
      // Format like Playwright MCP
      const formattedSnapshot = [
        '- Page Snapshot',
        '```yaml',
        `url: ${url}`,
        `title: ${title}`,
        '',
        structure,
        '```'
      ].join('\n');
      
      console.error('[MCP-CDP] Browser snapshot completed successfully');
      
      return {
        content: [{
          type: 'text',
          text: formattedSnapshot
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] Browser snapshot failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return {
          content: [{
            type: 'text',
            text: `Tab error: ${errorMessage}\nHint: Use browser_tabs_list to see available tabs.`
          }]
        };
      }
      return {
        content: [{
          type: 'text',
          text: `Error capturing snapshot: ${errorMessage}`
        }]
      };
    }
  },
});

// Helper to get page snapshot with element references
async function getPageSnapshot(connector: any): Promise<string> {
  const page = await connector.getPage();
  if (!page) {
    throw new Error('No page connected');
  }
  
  // Get accessibility tree
  const snapshot = await page.accessibility.snapshot({
    interestingOnly: true
  });
  
  if (!snapshot) {
    return 'No accessibility data available';
  }
  
  // Convert to simplified format with references
  const nodes = simplifyAccessibilityNode(snapshot);
  return formatAsYAML(nodes);
}

// Recursively simplify accessibility nodes
function simplifyAccessibilityNode(node: any, depth: number = 0): any[] {
  const results: any[] = [];
  
  if (!node) return results;
  
  // Extract relevant information
  const simplified: any = {
    role: node.role,
    name: node.name,
    value: node.value,
    description: node.description,
    level: depth
  };
  
  // Add additional properties if they exist
  if (node.checked !== undefined) simplified.checked = node.checked;
  if (node.disabled !== undefined) simplified.disabled = node.disabled;
  if (node.expanded !== undefined) simplified.expanded = node.expanded;
  if (node.selected !== undefined) simplified.selected = node.selected;
  if (node.multiselectable !== undefined) simplified.multiselectable = node.multiselectable;
  if (node.required !== undefined) simplified.required = node.required;
  if (node.readonly !== undefined) simplified.readonly = node.readonly;
  
  // Only include nodes with meaningful content
  if (simplified.role || simplified.name || simplified.value) {
    results.push(simplified);
  }
  
  // Process children
  if (node.children) {
    for (const child of node.children) {
      results.push(...simplifyAccessibilityNode(child, depth + 1));
    }
  }
  
  return results;
}

// Format simplified structure as YAML-like text with element references
function formatAsYAML(nodes: any[]): string {
  let result = 'elements:\n';
  let elementIndex = 0;
  
  // First pass: create selectors for interactive elements
  for (const node of nodes) {
    if (isInteractiveNode(node)) {
      const ref = `[${elementIndex}]`;
      const selector = createSelectorForNode(node);
      if (selector) {
        elementReferences.set(ref, selector);
        node._ref = ref;
        elementIndex++;
      }
    }
  }
  
  // Second pass: format the output
  for (const node of nodes) {
    // Skip non-relevant nodes for cleaner output
    if (!isRelevantNode(node)) {
      continue;
    }
    
    const indent = '  '.repeat(Math.min(node.level + 1, 3));
    const ref = node._ref || '';
    
    // Format like Playwright MCP: compact single-line format
    let line = `${indent}${ref}`;
    
    if (ref) line += ' ';
    
    line += `${node.role || 'element'}`;
    
    if (node.name) {
      line += ` "${node.name.replace(/"/g, '\'')}"`;
    }
    
    // Add value for input fields
    if (node.value && ['textbox', 'searchbox', 'spinbutton'].includes(node.role)) {
      line += ` (value: "${node.value.replace(/"/g, '\'')}")`;
    }
    
    // Add relevant states in brackets
    const states = [];
    if (node.checked) states.push('checked');
    if (node.disabled) states.push('disabled');
    if (node.selected) states.push('selected');
    if (node.expanded) states.push('expanded');
    if (node.required) states.push('required');
    if (node.readonly) states.push('readonly');
    
    if (states.length > 0) {
      line += ` [${states.join(', ')}]`;
    }
    
    result += line + '\n';
  }
  
  return result;
}

// Create a selector for an interactive node
function createSelectorForNode(node: any): string | null {
  // Try to create a unique selector for the node
  if (node.name) {
    const name = node.name.replace(/'/g, "\\'");
    
    switch (node.role) {
      case 'button':
        return `button:has-text("${name}")`;
      case 'link':
        return `a:has-text("${name}")`;
      case 'textbox':
      case 'searchbox':
        // Try to use placeholder or label
        if (node.description) {
          return `input[placeholder="${node.description}"]`;
        }
        return `input:near(:text("${name}"))`;
      case 'checkbox':
      case 'radio':
        return `input[type="${node.role}"]:near(:text("${name}"))`;
      case 'combobox':
      case 'listbox':
        return `select:near(:text("${name}"))`;
      default:
        return `[role="${node.role}"]:has-text("${name}")`;
    }
  }
  
  // Fallback to role-based selector
  if (node.role) {
    return `[role="${node.role}"]`;
  }
  
  return null;
}

// Check if a node is interactive
function isInteractiveNode(node: any): boolean {
  const interactiveRoles = [
    'button', 'link', 'textbox', 'checkbox', 'radio',
    'combobox', 'listbox', 'menu', 'menuitem', 'tab',
    'slider', 'spinbutton', 'searchbox', 'switch'
  ];
  
  return interactiveRoles.includes(node.role);
}

// Check if a node is relevant for the snapshot
function isRelevantNode(node: any): boolean {
  // Skip empty text nodes
  if (node.role === 'text' && (!node.name || node.name.trim() === '')) {
    return false;
  }
  
  // Include interactive elements
  if (isInteractiveNode(node)) {
    return true;
  }
  
  // Include important structural elements
  const structuralRoles = [
    'heading', 'img', 'list', 'listitem', 'article',
    'navigation', 'main', 'form', 'table', 'region'
  ];
  
  if (structuralRoles.includes(node.role)) {
    return true;
  }
  
  // Include if it has a meaningful name and isn't generic
  if (node.name && node.name.trim().length > 0 && node.role !== 'generic') {
    return true;
  }
  
  return false;
}

// Export element schema for use by other tools
export const elementSchema = z.object({
  element: z.string().describe('Human-readable element description used to obtain permission to interact with the element'),
  ref: z.string().describe('Exact target element reference from the page snapshot')
});

export default [
  snapshot,
];