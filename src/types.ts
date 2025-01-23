// API Response Types
export interface EOLCycle {
  cycle: string;
  releaseDate: string;
  eol: string;
  latest: string;
  support?: string | boolean;
  lts?: string | boolean;
  link?: string;
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
  cveDetails?: CVEDetails[];
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

// CVE Types
export interface CVEDetails {
  cve_id: string;
  cvss_score: number;
  summary: string;
  published_date: string;
  last_update: string;
  vulnerability_type: string;
}

export interface CVECheckArgs {
  product: string;
  version: string;
  vendor?: string;
}

export function isValidCVECheckArgs(args: any): args is CVECheckArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "product" in args &&
    typeof args.product === "string" &&
    "version" in args &&
    typeof args.version === "string" &&
    (args.vendor === undefined || typeof args.vendor === "string")
  );
}

export interface CompareVersionsArgs {
  product: string;
  version: string;
}

export function isValidCompareVersionsArgs(args: any): args is CompareVersionsArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "product" in args &&
    typeof args.product === "string" &&
    "version" in args &&
    typeof args.version === "string"
  );
}

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  daysToEol: number;
  isSupported: boolean;
  validationMessage: string;
}

export interface VersionValidation {
  eol: {
    date: string;
    valid: boolean;
    daysRemaining: number;
    message: string;
  };
  support: {
    isSupported: boolean;
    message: string;
  };
  security: {
    isSupported: boolean;
    message: string;
  };
}

export interface ValidationsResult {
  validations: Record<string, VersionValidation>;
  validVersions: string[];
}

// Add GetAllDetailsArgs interface
export interface GetAllDetailsArgs {
  product: string;
}

// Add type guard for GetAllDetailsArgs
export function isValidGetAllDetailsArgs(args: any): args is GetAllDetailsArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "product" in args &&
    typeof args.product === "string"
  );
}