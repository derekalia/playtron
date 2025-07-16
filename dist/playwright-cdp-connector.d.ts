import { Page } from 'playwright';
/**
 * Connects Playwright to our Electron app via Chrome DevTools Protocol
 * This allows us to use Playwright's features while keeping the Electron UI
 */
export declare class PlaywrightCDPConnector {
    private browser;
    private context;
    private page;
    private cdpEndpoint;
    private tabPageMap;
    constructor();
    /**
     * Connect to the Electron browser via CDP
     * Browser availability is already confirmed before calling this
     */
    connect(): Promise<void>;
    /**
     * Set up event listeners for the page
     */
    private setupPageListeners;
    /**
     * Get accessibility snapshot of the current page
     * This is the key feature - getting structured data without screenshots
     */
    getAccessibilitySnapshot(options?: {
        interestingOnly?: boolean;
        root?: any;
    }): Promise<any>;
    /**
     * Convert accessibility snapshot to a simplified format
     * Following Playwright MCP's approach
     */
    getSimplifiedPageStructure(): Promise<string>;
    /**
     * Recursively simplify accessibility nodes
     */
    private simplifyAccessibilityNode;
    /**
     * Format simplified structure as YAML-like text
     * Following Playwright MCP's compact format with element references
     */
    private formatAsYAML;
    /**
     * Check if a node is interactive (can be clicked, typed into, etc.)
     */
    private isInteractiveNode;
    /**
     * Check if a node is relevant for the snapshot
     */
    private isRelevantNode;
    /**
     * Get the connected Playwright page instance
     */
    getPage(): Page | null;
    /**
     * Disconnect from the browser
     */
    disconnect(): Promise<void>;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Ensure we're controlling the correct page (WebContentsView)
     * Call this before operations to handle page switches
     */
    ensureCorrectPage(): Promise<void>;
    /**
     * Create a new tab by calling the Electron main process
     * Returns the tab ID
     */
    createTab(url?: string): Promise<string>;
    /**
     * Switch to a specific tab
     */
    switchTab(tabId: string): Promise<boolean>;
    /**
     * List all available tabs
     */
    listTabs(): Promise<any[]>;
}
//# sourceMappingURL=playwright-cdp-connector.d.ts.map