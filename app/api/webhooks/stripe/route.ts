
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function stripeId(
  value: string | { id: string } | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function mapSubscriptionStatus(
  status: Stripe.Subscription.Status
):
  | "PENDING"
  | "ACTIVE"
  | "PAST_DUE"
  | "UNPAID"
  | "PAUSED"
  | "CANCELED"
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED" {
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

function mapPaymentStatus(
  status: Stripe.PaymentIntent.Status
):
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED" {
  switch (status) {
    case "processing":
      return "PROCESSING";
    case "succeeded":
      return "SUCCEEDED";
    case "canceled":
      return "CANCELED";
    case "requires_payment_method":
      return "FAILED";
    default:
      return "PENDING";
  }
}

function mapBillingInterval(
  interval: string
): "WEEK" | "MONTH" | "YEAR" {
  switch (interval) {
    case "week":
      return "WEEK";
    case "month":
      return "MONTH";
    case "year":
      return "YEAR";
    default:
      throw new Error(`Unsupported billing interval: ${interval}`);
  }
}

async function markEventProcessed(eventId: string) {
  await prisma.webhookEvent.update({
    where: { stripeEventId: eventId },
    data: {
      status: "PROCESSED",
      processedAt: new Date(),
      errorMessage: null,
    },
  });
}

// --------------------------------------------------
// Subscription synchronisation
// --------------------------------------------------

async function syncSubscription(
  subscription: Stripe.Subscription
) {
  const stripeCustomerId = stripeId(subscription.customer);

  if (!stripeCustomerId) {
    throw new Error("Subscription has no Stripe customer.");
  }

  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { id: subscription.metadata.internalCustomerId || "__missing__" },
        { stripeCustomerId },
      ],
    },
  });

  if (!customer) {
    throw new Error(
      `Customer not found for subscription ${subscription.id}`
    );
  }

  const defaultPaymentMethodId =
    stripeId(subscription.default_payment_method);

  const internalPaymentMethodId =
    subscription.metadata.internalPaymentMethodId;

  let paymentMethod = internalPaymentMethodId
    ? await prisma.paymentMethod.findFirst({
        where: {
          id: internalPaymentMethodId,
          customerId: customer.id,
          status: "ACTIVE",
        },
      })
    : null;

  if (!paymentMethod && defaultPaymentMethodId) {
    paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        stripePaymentMethodId: defaultPaymentMethodId,
        customerId: customer.id,
        status: "ACTIVE",
      },
    });
  }

  if (!paymentMethod) {
    throw new Error(
      `Active payment method not found for subscription ${subscription.id}`
    );
  }

  const item = subscription.items.data[0];

  if (!item) {
    throw new Error("Subscription has no billing item.");
  }

  const recurring = item.price.recurring;

  if (!recurring) {
    throw new Error("Subscription price is not recurring.");
  }

  const existing = await prisma.subscription.findUnique({
    where: {
      stripeSubscriptionId: subscription.id,
    },
  });

  const amount = item.price.unit_amount ?? existing?.amount;

  if (amount == null) {
    throw new Error("Subscription amount is unavailable.");
  }

  const data = {
    customerId: customer.id,
    paymentMethodId: paymentMethod.id,
    amount,
    currency: item.price.currency,
    interval: mapBillingInterval(recurring.interval),
    intervalCount: recurring.interval_count,
    status: mapSubscriptionStatus(subscription.status),
    currentPeriodStart: new Date(
      item.current_period_start * 1000
    ),
    currentPeriodEnd: new Date(
      item.current_period_end * 1000
    ),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000)
      : null,
    trialEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
  };

  await prisma.subscription.upsert({
    where: {
      stripeSubscriptionId: subscription.id,
    },
    update: data,
    create: {
      ...data,
      stripeSubscriptionId: subscription.id,
      startDate: new Date(subscription.created * 1000),
    },
  });
}

// --------------------------------------------------
// Payment synchronisation
// --------------------------------------------------

async function savePayment(
  paymentIntent: Stripe.PaymentIntent,
  type: "ONE_TIME" | "SUBSCRIPTION",
  subscriptionId?: string
) {
  const stripeCustomerId = stripeId(paymentIntent.customer);

  const internalCustomerId =
    paymentIntent.metadata.internalCustomerId;

  if (!stripeCustomerId && !internalCustomerId) {
    throw new Error(
      `PaymentIntent ${paymentIntent.id} has no customer reference.`
    );
  }

  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { id: internalCustomerId || "__missing__" },
        ...(stripeCustomerId ? [{ stripeCustomerId }] : []),
      ],
    },
  });

  if (!customer) {
    throw new Error(
      `Customer not found for PaymentIntent ${paymentIntent.id}`
    );
  }

  const stripePaymentMethodId = stripeId(
    paymentIntent.payment_method
  );

  const internalPaymentMethodId =
    paymentIntent.metadata.internalPaymentMethodId;

  let paymentMethod = internalPaymentMethodId
    ? await prisma.paymentMethod.findFirst({
        where: {
          id: internalPaymentMethodId,
          customerId: customer.id,
        },
      })
    : null;

  if (!paymentMethod && stripePaymentMethodId) {
    paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        stripePaymentMethodId,
        customerId: customer.id,
      },
    });
  }

  const subscription = subscriptionId
    ? await prisma.subscription.findUnique({
        where: {
          stripeSubscriptionId: subscriptionId,
        },
      })
    : null;

  if (subscriptionId && !subscription) {
    throw new Error(
      `Local subscription not found: ${subscriptionId}`
    );
  }

  const latestCharge = stripeId(paymentIntent.latest_charge);

  const existing = await prisma.payment.findUnique({
    where: {
      stripePaymentIntentId: paymentIntent.id,
    },
  });

  const paidAt =
    paymentIntent.status === "succeeded"
      ? existing?.paidAt ?? new Date()
      : null;

  await prisma.payment.upsert({
    where: {
      stripePaymentIntentId: paymentIntent.id,
    },
    update: {
      status: mapPaymentStatus(paymentIntent.status),
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      stripeChargeId: latestCharge,
      paymentMethodId: paymentMethod?.id ?? existing?.paymentMethodId ?? null,
      subscriptionId: subscription?.id ?? existing?.subscriptionId ?? null,
      failureCode:
        paymentIntent.last_payment_error?.code ?? null,
      failureMessage:
        paymentIntent.last_payment_error?.message ?? null,
      paidAt,
    },
    create: {
      customerId: customer.id,
      paymentMethodId: paymentMethod?.id ?? null,
      subscriptionId: subscription?.id ?? null,
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: latestCharge,
      type,
      status: mapPaymentStatus(paymentIntent.status),
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      failureCode:
        paymentIntent.last_payment_error?.code ?? null,
      failureMessage:
        paymentIntent.last_payment_error?.message ?? null,
      paidAt,
    },
  });
}

// --------------------------------------------------
// Subscription invoice-payment lookup
// Stripe invoices are NOT stored in our database.
// --------------------------------------------------

async function syncSubscriptionInvoicePayment(
  invoiceId: string
) {
  const invoice = await stripe.invoices.retrieve(invoiceId);

  const subscriptionReference =
    invoice.parent?.subscription_details?.subscription;

  const stripeSubscriptionId = stripeId(
    subscriptionReference
  );

  if (!stripeSubscriptionId) {
    // This is not a subscription invoice.
    return;
  }

  let subscription = await prisma.subscription.findUnique({
    where: {
      stripeSubscriptionId,
    },
  });

  if (!subscription) {
    const stripeSubscription =
      await stripe.subscriptions.retrieve(stripeSubscriptionId);

    await syncSubscription(stripeSubscription);

    subscription = await prisma.subscription.findUnique({
      where: {
        stripeSubscriptionId,
      },
    });
  }

  if (!subscription) {
    throw new Error(
      `Subscription not found: ${stripeSubscriptionId}`
    );
  }

  const invoicePayments = await stripe.invoicePayments.list({
    invoice: invoiceId,
    limit: 100,
  });

  for (const invoicePayment of invoicePayments.data) {
    const paymentIntentId = stripeId(
      invoicePayment.payment.payment_intent
    );

    if (!paymentIntentId) continue;

    const paymentIntent =
      await stripe.paymentIntents.retrieve(paymentIntentId);

    await savePayment(
      paymentIntent,
      "SUBSCRIPTION",
      stripeSubscriptionId
    );
  }
}

// --------------------------------------------------
// PaymentIntent event handler
// --------------------------------------------------

async function handlePaymentIntent(
  paymentIntent: Stripe.PaymentIntent
) {
  const paymentType =
    paymentIntent.metadata.paymentType ??
    paymentIntent.metadata.internalPaymentType;

  if (paymentType === "ONE_TIME") {
    await savePayment(paymentIntent, "ONE_TIME");
    return;
  }

  // Subscription PaymentIntents are associated with
  // their subscription through Stripe invoice payments.
  const invoicePayments = await stripe.invoicePayments.list({
    payment: {
      type: "payment_intent",
      payment_intent: paymentIntent.id,
    },
    limit: 10,
  });

  for (const invoicePayment of invoicePayments.data) {
    const invoiceId = stripeId(invoicePayment.invoice);

    if (invoiceId) {
      await syncSubscriptionInvoicePayment(invoiceId);
    }
  }
}

// --------------------------------------------------
// Main webhook endpoint
// --------------------------------------------------

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Webhook configuration is incomplete." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const rawBody = await request.text();

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);

    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 }
    );
  }

  try {
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: {
        stripeEventId: event.id,
      },
    });

    if (existingEvent?.status === "PROCESSED") {
      return NextResponse.json({
        received: true,
        duplicate: true,
      });
    }

    await prisma.webhookEvent.upsert({
      where: {
        stripeEventId: event.id,
      },
      update: {
        attempts: { increment: 1 },
        status: "RECEIVED",
      },
      create: {
        stripeEventId: event.id,
        eventType: event.type,
        status: "RECEIVED",
        payload: JSON.parse(JSON.stringify(event)),
        attempts: 1,
      },
    });

    // ----------------------------------------------
    // SEPA mandate successfully authorised
    // ----------------------------------------------

    if (event.type === "setup_intent.succeeded") {
      const setupIntent =
        event.data.object as Stripe.SetupIntent;

      const customerId =
        setupIntent.metadata?.internalCustomerId;

      const stripeCustomerId = stripeId(
        setupIntent.customer
      );

      const stripePaymentMethodId = stripeId(
        setupIntent.payment_method
      );

      const stripeMandateId = stripeId(
        setupIntent.mandate
      );

      if (
        !customerId ||
        !stripeCustomerId ||
        !stripePaymentMethodId ||
        !stripeMandateId
      ) {
        throw new Error(
          "SetupIntent is missing its customer, payment method, or mandate."
        );
      }

      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          stripeCustomerId,
        },
      });

      if (!customer) {
        throw new Error(
          "Matching registered customer was not found."
        );
      }

      const paymentMethod =
        await stripe.paymentMethods.retrieve(
          stripePaymentMethodId
        );

      if (paymentMethod.type !== "sepa_debit") {
        throw new Error("Unexpected payment method type.");
      }

      const mandate =
        await stripe.mandates.retrieve(stripeMandateId);

      if (mandate.status !== "active") {
        throw new Error("Stripe mandate is not active.");
      }

      const sepaDetails = paymentMethod.sepa_debit;

      if (!sepaDetails) {
        throw new Error(
          "SEPA bank account details were not returned."
        );
      }

      const acceptance = mandate.customer_acceptance;

      const onlineAcceptance =
        acceptance.type === "online"
          ? acceptance.online
          : null;

      await prisma.$transaction(async (tx) => {
        const savedPaymentMethod =
          await tx.paymentMethod.upsert({
            where: {
              stripePaymentMethodId,
            },
            update: {
              status: "ACTIVE",
              bankCountry: sepaDetails.country,
              last4: sepaDetails.last4,
              fingerprint: sepaDetails.fingerprint,
            },
            create: {
              customerId: customer.id,
              stripePaymentMethodId,
              type: "SEPA_DEBIT",
              status: "ACTIVE",
              bankCountry: sepaDetails.country,
              last4: sepaDetails.last4,
              fingerprint: sepaDetails.fingerprint,
              isDefault: true,
            },
          });

        await tx.mandate.upsert({
          where: {
            stripeMandateId,
          },
          update: {
            status: "ACTIVE",
            reference:
              mandate.payment_method_details.sepa_debit
                ?.reference ?? null,
            acceptanceType: acceptance.type,
            acceptedAt: acceptance.accepted_at
              ? new Date(acceptance.accepted_at * 1000)
              : null,
            acceptanceIp:
              onlineAcceptance?.ip_address ?? null,
            userAgent:
              onlineAcceptance?.user_agent ?? null,
          },
          create: {
            customerId: customer.id,
            paymentMethodId: savedPaymentMethod.id,
            stripeMandateId,
            status: "ACTIVE",
            reference:
              mandate.payment_method_details.sepa_debit
                ?.reference ?? null,
            acceptanceType: acceptance.type,
            acceptedAt: acceptance.accepted_at
              ? new Date(acceptance.accepted_at * 1000)
              : null,
            acceptanceIp:
              onlineAcceptance?.ip_address ?? null,
            userAgent:
              onlineAcceptance?.user_agent ?? null,
          },
        });

        await tx.webhookEvent.update({
          where: {
            stripeEventId: event.id,
          },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
            errorMessage: null,
          },
        });
      });
    }

    // ----------------------------------------------
    // SetupIntent failed
    // ----------------------------------------------

    else if (event.type === "setup_intent.setup_failed") {
      await markEventProcessed(event.id);
    }

    // ----------------------------------------------
    // Payment method detached
    // ----------------------------------------------

    else if (event.type === "payment_method.detached") {
      const detachedMethod =
        event.data.object as Stripe.PaymentMethod;

      await prisma.$transaction(async (tx) => {
        const savedMethod =
          await tx.paymentMethod.findUnique({
            where: {
              stripePaymentMethodId: detachedMethod.id,
            },
          });

        if (savedMethod) {
          await tx.paymentMethod.update({
            where: {
              id: savedMethod.id,
            },
            data: {
              status: "DETACHED",
            },
          });

          await tx.mandate.updateMany({
            where: {
              paymentMethodId: savedMethod.id,
              status: "ACTIVE",
            },
            data: {
              status: "INACTIVE",
            },
          });
        }

        await tx.webhookEvent.update({
          where: {
            stripeEventId: event.id,
          },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
          },
        });
      });
    }

    // ----------------------------------------------
    // Subscription lifecycle
    // ----------------------------------------------

    else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.paused" ||
      event.type === "customer.subscription.resumed"
    ) {
      const subscription =
        event.data.object as Stripe.Subscription;

      await syncSubscription(subscription);
      await markEventProcessed(event.id);
    }

    // ----------------------------------------------
    // One-time and subscription PaymentIntents
    // ----------------------------------------------

    else if (
      event.type === "payment_intent.created" ||
      event.type === "payment_intent.processing" ||
      event.type === "payment_intent.succeeded" ||
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled"
    ) {
      const paymentIntent =
        event.data.object as Stripe.PaymentIntent;

      await handlePaymentIntent(paymentIntent);
      await markEventProcessed(event.id);
    }

    // ----------------------------------------------
    // Subscription collection outcomes
    // ----------------------------------------------

    else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.payment_failed"
    ) {
      const invoice = event.data.object as Stripe.Invoice;

      await syncSubscriptionInvoicePayment(invoice.id);
      await markEventProcessed(event.id);
    }

    // ----------------------------------------------
    // Acknowledge other events
    // ----------------------------------------------

    else {
      await markEventProcessed(event.id);
    }

    return NextResponse.json({
      received: true,
      eventId: event.id,
      processed: true,
    });
  } catch (error) {
    console.error("Stripe webhook processing error:", error);

    await prisma.webhookEvent.update({
      where: {
        stripeEventId: event.id,
      },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unknown processing error",
      },
    }).catch((dbError) => {
      console.error(
        "Unable to update webhook event:",
        dbError
      );
    });

    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 }
    );
  }
}
