import { apiError } from "@/lib/api/http";

// Unknown API paths answer in JSON, not with the site's HTML 404 page.
const notFound = () => apiError(404, "not_found", "Unknown endpoint. See https://spamlyze.com/docs/api");

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
