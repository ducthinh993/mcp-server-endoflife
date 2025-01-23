// API Response Types
export interface EOLCycle {
  cycle: string;
  releaseDate: string;
  eol: string;
  latest: string;
  lts?: string;
  support?: string;
  discontinued?: string;
}

export interface ProductInfo {
  product: string;
  cycles: EOLCycle[];
  timestamp: string;
}

// Tool Types
export interface CheckVersionArgs {
  product: string;
  version?: string;
}

export interface ListProductsArgs {
  filter?: string;
}

// Type guards
export function isValidCheckVersionArgs(args: any): args is CheckVersionArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "product" in args &&
    typeof args.product === "string" &&
    (args.version === undefined || typeof args.version === "string")
  );
}

export function isValidListProductsArgs(args: any): args is ListProductsArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    (args.filter === undefined || typeof args.filter === "string")
  );
}

// Recent queries cache type
export interface CachedQuery {
  product: string;
  version?: string;
  response: EOLCycle[];
  timestamp: string;
}

// Prompt Types
export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface Prompt {
  name: string;
  description: string;
  arguments?: PromptArgument[];
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
}

export interface GetPromptResult {
  messages: PromptMessage[];
}