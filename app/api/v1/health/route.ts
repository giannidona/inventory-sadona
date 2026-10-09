import type { NextRequest } from "next/server";
import { apiJson, apiOptions } from "@/lib/api";

export const OPTIONS = apiOptions;

/** GET /api/v1/health — sin autenticación, para chequear que la API responde. */
export async function GET(request: NextRequest) {
  return apiJson(request, { status: "ok", version: "v1" });
}
