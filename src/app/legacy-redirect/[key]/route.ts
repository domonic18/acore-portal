import { NextResponse, type NextRequest } from "next/server";
import { lookupLegacyRoute } from "@/server/services/route-map";

/**
 * route_map 查表出口:命中 301 / 未命中 404 / 库不可达 503(FR-026)。
 * edge middleware 不能查库;键走路径段(/legacy-redirect/p:123)而非查询参数——
 * Next 14 rewrite 会丢弃目标 URL 的查询参数,实测踩坑。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string } },
) {
  let newPath: string | null;
  try {
    newPath = await lookupLegacyRoute(decodeURIComponent(params.key));
  } catch {
    return new NextResponse(null, { status: 503 });
  }
  if (!newPath) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.redirect(new URL(newPath, _req.url), 301);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
