
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      email,
      phone,
      country,
      addressLine1,
      addressLine2,
      city,
      postalCode,
    } = body;

    if (
      !name ||
      !email ||
      !country ||
      !addressLine1 ||
      !city ||
      !postalCode
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Please complete all required fields.",
        },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Find an existing customer or create a new one.
    let customer = await prisma.customer.findUnique({
      where: { email: normalizedEmail },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: String(name).trim(),
          email: normalizedEmail,
          phone: phone ? String(phone).trim() : null,
          country: String(country).trim(),
          addressLine1: String(addressLine1).trim(),
          addressLine2: addressLine2
            ? String(addressLine2).trim()
            : null,
          city: String(city).trim(),
          postalCode: String(postalCode).trim(),
        },
      });
    }

    // Reuse an existing Stripe Customer if already created.
    if (customer.stripeCustomerId) {
      return NextResponse.json({
        success: true,
        message: "Customer is already registered.",
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          stripeCustomerId: customer.stripeCustomerId,
        },
      });
    }

    // Create the Stripe Customer.
    
    const stripeCustomer = await stripe.customers.create(
    {
        name: customer.name ?? undefined,
        email: customer.email ?? undefined,
        phone: customer.phone ?? undefined,
        address: {
        line1: customer.addressLine1 ?? undefined,
        line2: customer.addressLine2 ?? undefined,
        city: customer.city ?? undefined,
        postal_code: customer.postalCode ?? undefined,
        country: customer.country ?? undefined,
        },
        metadata: {
        internalCustomerId: customer.id,
        source: "doclypdf.online",
        },
    },
    {
        idempotencyKey: `customer_${customer.id}`,
    }
    );


    // Save the Stripe Customer ID in Neon.
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        stripeCustomerId: stripeCustomer.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Customer registered successfully.",
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          stripeCustomerId: customer.stripeCustomerId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Customer registration error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to complete customer registration.",
      },
      { status: 500 }
    );
  }
}
