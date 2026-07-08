import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { openPosition } from "@/lib/trading-engine";

const LISTING_FEE_USDC = 200;
const STARTING_PRICE = 0.01;
const SEED_BUY_USDC = 1;

export async function POST(request: NextRequest) {
  try {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      description,
      logo_url,
      pitch,
      website,
      twitter,
      stage,
    } = body;

    // Validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Startup name is required" },
        { status: 400 }
      );
    }

    if (!description || typeof description !== "string" || !description.trim()) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

    if (description.length > 100) {
      return NextResponse.json(
        { error: "Description must be 100 characters or less" },
        { status: 400 }
      );
    }

    const allowedStages = ["Idea", "MVP", "Seed", "Series A+"];
    if (stage !== undefined && stage !== null && stage !== "" && !allowedStages.includes(stage)) {
      return NextResponse.json(
        { error: "Invalid stage. Must be one of: Idea, MVP, Seed, Series A+" },
        { status: 400 }
      );
    }

    // Check balance
    const { data: balance, error: balError } = await supabaseAdmin
      .from("balances")
      .select("available_usdc")
      .eq("user_id", user.id)
      .single();

    if (balError || !balance) {
      return NextResponse.json({ error: "User balance not found" }, { status: 404 });
    }

    if (Number(balance.available_usdc) < LISTING_FEE_USDC) {
      return NextResponse.json(
        { error: "Insufficient balance. Deposit funds first." },
        { status: 400 }
      );
    }

    // Deduct listing fee
    const newAvailable = Number(balance.available_usdc) - LISTING_FEE_USDC;
    const { error: updateError } = await supabaseAdmin
      .from("balances")
      .update({ available_usdc: newAvailable })
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to deduct listing fee" }, { status: 500 });
    }

    // Create startup record
    const { data: startup, error: startupError } = await supabaseAdmin
      .from("startup_startups")
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description.trim(),
        logo_url: logo_url || null,
        pitch: pitch || null,
        website: website || null,
        twitter: twitter || null,
        stage: stage || null,
      })
      .select("id")
      .single();

    if (startupError || !startup) {
      // Roll back the fee deduction
      await supabaseAdmin
        .from("balances")
        .update({ available_usdc: Number(balance.available_usdc) })
        .eq("user_id", user.id);
      return NextResponse.json({ error: "Failed to create startup" }, { status: 500 });
    }

    // Create market record
    const { data: market, error: marketError } = await supabaseAdmin
      .from("startup_markets")
      .insert({
        startup_id: startup.id,
        current_price: STARTING_PRICE,
        total_supply: 0,
        volume_24h: 0,
      })
      .select("id")
      .single();

    if (marketError || !market) {
      // Roll back startup and fee
      await supabaseAdmin.from("startup_startups").delete().eq("id", startup.id);
      await supabaseAdmin
        .from("balances")
        .update({ available_usdc: Number(balance.available_usdc) })
        .eq("user_id", user.id);
      return NextResponse.json({ error: "Failed to create market" }, { status: 500 });
    }

    // Record listing fee transaction
    await supabaseAdmin.from("startup_transactions").insert({
      user_id: user.id,
      type: "listing_fee",
      amount_usdc: -LISTING_FEE_USDC,
      description: `Listing fee for ${name.trim()} (market ${market.id})`,
    });

    // Seed initial liquidity with an automatic $1 platform long buy.
    // This ensures total supply is never zero, so shorts can open from launch.
    const platformUserId = process.env.PLATFORM_SYSTEM_USER_ID;
    if (platformUserId) {
      try {
        await openPosition(platformUserId, market.id, "long", SEED_BUY_USDC);
      } catch (seedError) {
        console.error("Seed buy failed for market", market.id, seedError);
      }
    } else {
      console.error("PLATFORM_SYSTEM_USER_ID is not set; skipping seed buy");
    }

    return NextResponse.json({
      data: {
        startup_id: startup.id,
        market_id: market.id,
        available_usdc: newAvailable,
      },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
