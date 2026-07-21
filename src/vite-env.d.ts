/// <reference types="vite/client" />

// MCP tool bundle runs in the Supabase Edge Function (Deno) at runtime, but
// authored in the Vite/TS project. Declare `process.env` for type-checking.
declare const process: { env: Record<string, string | undefined> };
