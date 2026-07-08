import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { isAdmin } from "@/lib/admin";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: startupId } = await params;

    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: startup, error: fetchError } = await supabaseAdmin
      .from("startup_startups")
      .select("id, user_id")
      .eq("id", startupId)
      .single();

    if (fetchError || !startup) {
      return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    }

    const userIsAdmin = isAdmin(user.email);
    if (startup.user_id !== user.id && !userIsAdmin) {
      return NextResponse.json(
        { error: "Forbidden: only the founder or an admin can delete this startup" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("startup_startups")
      .delete()
      .eq("id", startupId);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete startup" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: startupId } = await params;

    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: startup, error: fetchError } = await supabaseAdmin
      .from("startup_startups")
      .select("id, user_id")
      .eq("id", startupId)
      .single();

    if (fetchError || !startup) {
      return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    }

    const userIsAdmin = isAdmin(user.email);
    if (startup.user_id !== user.id && !userIsAdmin) {
      return NextResponse.json(
        { error: "Forbidden: only the founder or an admin can update this startup" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, pitch, website, twitter, stage } = body;

    const allowedStages = ["Idea", "MVP", "Seed", "Series A+"];
    if (stage !== undefined && stage !== null && stage !== "" && !allowedStages.includes(stage)) {
      return NextResponse.json(
        { error: "Invalid stage. Must be one of: Idea, MVP, Seed, Series A+" },
        { status: 400 }
      );
    }

    if (name !== undefined && typeof name === "string" && !name.trim()) {
      return NextResponse.json({ error: "Startup name cannot be empty" }, { status: 400 });
    }

    if (description !== undefined && typeof description === "string" && !description.trim()) {
      return NextResponse.json(
        { error: "Startup description cannot be empty" },
        { status: 400 }
      );
    }

    const update: Record<string, string | null> = {};
    if (name !== undefined) update.name = name.trim();
    if (description !== undefined) update.description = description.trim();
    if (pitch !== undefined) update.pitch = pitch.trim() || null;
    if (website !== undefined) update.website = website.trim() || null;
    if (twitter !== undefined) update.twitter = twitter.trim() || null;
    if (stage !== undefined) update.stage = stage || null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields provided to update" }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("startup_startups")
      .update(update)
      .eq("id", startupId)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || "Failed to update startup" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: updated, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
