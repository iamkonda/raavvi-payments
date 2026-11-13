
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

function mapSubscriptionStatus(status: string) {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "paused":
      return "PAUSED";
    case "canceled":
      return "CANCELED";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    default:
      return "PENDING";
  }
}


export async function GET() {
  try {
    const admin = await getAdminSession();

    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const subscriptions = await prisma.subscription.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            country: true,
          },
        },
        paymentMethod: {
          select: {
            id: true,
            type: true,
            status: true,
            bankCountry: true,
            last4: true,
          },
        },
        _count: {
          select: {
            payments: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      subscriptions,
    });
  } catch (error) {
    console.error("Subscription listing error:", error);

    return NextResponse.json(
      { error: "Unable to retrieve subscriptions." },
      { status: 500 }
    );
  }
}


export async function POST(request: NextRequest) {
  try {
    // 1. Require an authenticated admin.
    const admin = await getAdminSession();

    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    // 2. Read and validate the request.
    const body = await request.json();

    const {
      customerId,
      paymentMethodId,
      amount,
      currency,
      interval,
      intervalCount,
      idempotencyKey,
    } = body;

    if (
      typeof customerId !== "string" ||
      typeof paymentMethodId !== "string" ||
      !Number.isInteger(amount) ||
      amount < 50 ||
      !["WEEK", "MONTH", "YEAR"].includes(interval) ||
      !Number.isInteger(intervalCount) ||
      intervalCount < 1 ||
      intervalCount > 12 ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 200
    ) {
      return NextResponse.json(
        { error: "Invalid subscription details." },
        { status: 400 }
      );
    }

    // SEPA Direct Debit subscriptions must use EUR.
    if (typeof currency !== "string" || currency.toLowerCase() !== "eur") {
      return NextResponse.json(
        { error: "SEPA Direct Debit subscriptions must use EUR." },
        { status: 400 }
      );
    }

    // 3. Find the customer and the exact active SEPA payment method.
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || !customer.stripeCustomerId) {
      return NextResponse.json(
        { error: "Customer or Stripe customer record not found." },
        { status: 404 }
      );
    }

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
            "This customer does not have an active SEPA payment method with an active mandate.",
        },
        { status: 400 }
      );
    }

    // 4. Verify the payment method with Stripe.
    const stripePaymentMethod = await stripe.paymentMethods.retrieve(
      savedMethod.stripePaymentMethodId
    );

    if (
      stripePaymentMethod.type !== "sepa_debit" ||
      stripePaymentMethod.customer !== customer.stripeCustomerId
    ) {
      return NextResponse.json(
        { error: "The saved SEPA payment method is invalid." },
        { status: 400 }
      );
    }

    // 5. Map the billing interval to Stripe's format.
    const stripeInterval: "week" | "month" | "year" =
        interval === "WEEK"
            ? "week"
            : interval === "MONTH"
            ? "month"
            : "year";

    // 6. Create the Stripe subscription.
    // Stripe automatically creates the first invoice and attempts
    // collection using the saved SEPA payment method.
    const stripeProduct = await stripe.products.create(
        {
            name: `Subscription for ${customer.name}`,
        },
        {
            idempotencyKey: `${idempotencyKey}_product`,
        }
    );
    const stripeSubscription = await stripe.subscriptions.create(
      {
        customer: customer.stripeCustomerId,
        items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: amount,
              product: stripeProduct.id,
              recurring: {
                interval: stripeInterval,
                interval_count: intervalCount,
              },
            },
          },
        ],
        default_payment_method: savedMethod.stripePaymentMethodId,
        collection_method: "charge_automatically",
        payment_behavior: "allow_incomplete",
        off_session: true,
        payment_settings: {
          payment_method_types: ["sepa_debit"],
          save_default_payment_method: "on_subscription",
        },
        metadata: {
          internalCustomerId: customer.id,
          internalPaymentMethodId: savedMethod.id,
          createdByAdminId: admin.id,
        },
      },
      {
        idempotencyKey,
      }
    );

   
    
    // 7. Save or recover the subscription in our database.
    const subscription = await prisma.subscription.upsert({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
      update: {
        amount,
        currency: "eur",
        interval,
        intervalCount,
        status: mapSubscriptionStatus(stripeSubscription.status),
      },
      create: {
        customerId: customer.id,
        paymentMethodId: savedMethod.id,
        stripeSubscriptionId: stripeSubscription.id,
        amount,
        currency: "eur",
        interval,
        intervalCount,
        status: mapSubscriptionStatus(stripeSubscription.status),
        startDate: new Date(stripeSubscription.created * 1000),
      },
    });


    // 8. Return the result.
    return NextResponse.json(
      {
        success: true,
        message: "Subscription created. Initial collection status will be confirmed by Stripe.",
        subscription: {
          id: subscription.id,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          amount: subscription.amount,
          currency: subscription.currency,
          interval: subscription.interval,
          intervalCount: subscription.intervalCount,
          status: subscription.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Subscription creation error:", error);

    return NextResponse.json(
      {
        error: "Unable to create the subscription.",
        details:
          error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
