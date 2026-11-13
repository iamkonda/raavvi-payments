
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

function mapPaymentStatus(status: string) {
  switch (status) {
    case "succeeded":
      return "SUCCEEDED";
    case "processing":
      return "PROCESSING";
    case "canceled":
      return "CANCELED";
    case "requires_payment_method":
      return "FAILED";
    default:
      return "PENDING";
  }
}

// GET: Retrieve payment history.
export async function GET() {
  try {
    const admin = await getAdminSession();

    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const payments = await prisma.payment.findMany({
      where: {
        type: "ONE_TIME",
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        paymentMethod: {
          select: {
            type: true,
            bankCountry: true,
            last4: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error("Payment listing error:", error);

    return NextResponse.json(
      { error: "Unable to retrieve payments." },
      { status: 500 }
    );
  }
}

// POST: Initiate a one-time SEPA Direct Debit collection.
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate admin.
    const admin = await getAdminSession();

    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    // 2. Read and validate request.
    const body = await request.json();

    const {
      customerId,
      paymentMethodId,
      amount,
      description,
      idempotencyKey,
    } = body;

    if (
      typeof customerId !== "string" ||
      typeof paymentMethodId !== "string" ||
      !Number.isInteger(amount) ||
      amount < 50 ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 200
    ) {
      return NextResponse.json(
        { error: "Invalid payment details." },
        { status: 400 }
      );
    }

    if (
      typeof description !== "string" ||
      description.trim().length < 1 ||
      description.trim().length > 500
    ) {
      return NextResponse.json(
        { error: "A payment description is required." },
        { status: 400 }
      );
    }

    // 3. Find customer.
    const customer = await prisma.customer.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!customer || !customer.stripeCustomerId) {
      return NextResponse.json(
        { error: "Customer or Stripe customer record not found." },
        { status: 404 }
      );
    }

    // 4. Verify active SEPA payment method and mandate.
    const savedMethod = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        customerId,
        type: "SEPA_DEBIT",
        status: "ACTIVE",
        mandates: {
          some: {
            status: "ACTIVE",
          },
        },
      },
    });

    if (!savedMethod) {
      return NextResponse.json(
        {
          error:
            "The customer does not have an active SEPA payment method and mandate.",
        },
        { status: 400 }
      );
    }

    // 5. Verify the payment method with Stripe.
    const stripePaymentMethod =
      await stripe.paymentMethods.retrieve(
        savedMethod.stripePaymentMethodId
      );

    const stripeMethodCustomer =
      typeof stripePaymentMethod.customer === "string"
        ? stripePaymentMethod.customer
        : stripePaymentMethod.customer?.id;

    if (
      stripePaymentMethod.type !== "sepa_debit" ||
      stripeMethodCustomer !== customer.stripeCustomerId
    ) {
      return NextResponse.json(
        { error: "The saved SEPA payment method is invalid." },
        { status: 400 }
      );
    }

    // 6. Create and confirm the one-time PaymentIntent.
    // The customer has already authorised future off-session SEPA payments.
    // Stripe determines the eligible payment method from the saved method.
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency: "eur",
        customer: customer.stripeCustomerId,
        payment_method: savedMethod.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        description: description.trim(),
        metadata: {
          paymentType: "ONE_TIME",
          internalCustomerId: customer.id,
          internalPaymentMethodId: savedMethod.id,
          createdByAdminId: admin.id,
        },
      },
      {
        idempotencyKey,
      }
    );

    // 7. Save or recover payment in Neon.
    // The webhook may already have created this record.
    const payment = await prisma.payment.upsert({
      where: {
        stripePaymentIntentId: paymentIntent.id,
      },
      update: {
        status: mapPaymentStatus(paymentIntent.status),
        amount,
        currency: "eur",
        failureCode: paymentIntent.last_payment_error?.code ?? null,
        failureMessage:
          paymentIntent.last_payment_error?.message ?? null,
        paidAt:
          paymentIntent.status === "succeeded"
            ? new Date()
            : undefined,
      },
      create: {
        customerId: customer.id,
        paymentMethodId: savedMethod.id,
        stripePaymentIntentId: paymentIntent.id,
        type: "ONE_TIME",
        status: mapPaymentStatus(paymentIntent.status),
        amount,
        currency: "eur",
        failureCode: paymentIntent.last_payment_error?.code ?? null,
        failureMessage:
          paymentIntent.last_payment_error?.message ?? null,
        paidAt:
          paymentIntent.status === "succeeded"
            ? new Date()
            : null,
      },
    });

    // 8. Return the actual payment status.
    return NextResponse.json(
      {
        success: true,
        message:
          paymentIntent.status === "succeeded"
            ? "Payment succeeded."
            : paymentIntent.status === "processing"
              ? "Payment submitted and is processing."
              : "Payment initiated. Awaiting Stripe confirmation.",
        payment: {
          id: payment.id,
          stripePaymentIntentId: paymentIntent.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          stripeStatus: paymentIntent.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("One-time payment creation error:", error);

    return NextResponse.json(
      {
        error: "Unable to initiate the payment.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
