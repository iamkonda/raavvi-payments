
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const customers = await prisma.customer.count();
    const subscriptions = await prisma.subscription.count();
    const mandates = await prisma.mandate.count();

    return NextResponse.json({
      success: true,
      database: "Connected",
      tables: {
        customers,
        subscriptions,
        mandates,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Database query failed" },
      { status: 500 }
    );
  }
}
