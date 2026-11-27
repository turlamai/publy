// Narrow browser-only access policy. Authentication and ownership checks still run on actual requests.
export const WORKBENCH_ORIGIN = "https://publy.jrtx.site";

export function workbenchCorsMethod(url: string): "GET" | "POST" | null {
 if(url==="/v1/accounts"||/^\/v1\/publish-result\/[a-f0-9]{32}$/.test(url))return "GET";
 if(url==="/v1/publish")return "POST";
 return null;
}

export function validWorkbenchPreflight(method: string, requestedMethod: unknown, headers: unknown): boolean {
 if(requestedMethod!==method||typeof headers!=="string")return false;
 const names=headers.split(",").map(x=>x.trim().toLowerCase());
 return names.includes("x-api-key")&&names.every(x=>x==="x-api-key"||x==="content-type");
}
