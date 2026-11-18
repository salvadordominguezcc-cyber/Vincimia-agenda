export const runtime = "edge";

export async function GET() {
  return Response.json({
    ok: true,
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ),
  });
}
