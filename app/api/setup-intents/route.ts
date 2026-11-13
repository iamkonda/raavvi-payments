
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId } = body;

    if (!customerId || typeof customerId !== "string") {
      return NextResponse.json(
        { success: false, error: "Customer ID is required." },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || !customer.stripeCustomerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Registered Stripe customer not found.",
        },
        { status: 404 }
      );
    }

    const setupIntent = await stripe.setupIntents.create({
        customer: customer.stripeCustomerId,

        allowed_payment_method_types: ["sepa_debit"],

        usage: "off_session",

        metadata: {
            internalCustomerId: customer.id,
            customerEmail: customer.email,
        },
    });

    if (!setupIntent.client_secret) {
      throw new Error("Stripe did not return a SetupIntent client secret.");
    }

    return NextResponse.json({
      success: true,
      setupIntentId: setupIntent.id,
      clientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    console.error("SetupIntent creation error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to initialize SEPA mandate setup.",
      },
      { status: 500 }
    );
  }
}
