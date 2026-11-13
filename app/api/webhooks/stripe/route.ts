
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Webhook configuration is incomplete." },
      { status: 400 }
    );
  }

  let event;

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
      where: { stripeEventId: event.id },
    });

    if (existingEvent?.status === "PROCESSED") {
      return NextResponse.json({ received: true, duplicate: true });
    }

    await prisma.webhookEvent.upsert({
      where: { stripeEventId: event.id },
      update: { attempts: { increment: 1 } },
      create: {
        stripeEventId: event.id,
        eventType: event.type,
        status: "RECEIVED",
        payload: JSON.parse(JSON.stringify(event)),
        attempts: 1,
      },
    });

    if (event.type === "setup_intent.succeeded") {
      const setupIntent = event.data.object;

      const customerId = setupIntent.metadata.internalCustomerId;
      const stripeCustomerId =
        typeof setupIntent.customer === "string"
          ? setupIntent.customer
          : setupIntent.customer?.id;

      const stripePaymentMethodId =
        typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id;

      const stripeMandateId =
        typeof setupIntent.mandate === "string"
          ? setupIntent.mandate
          : setupIntent.mandate?.id;

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
        throw new Error("Matching registered customer was not found.");
      }

      const paymentMethod = await stripe.paymentMethods.retrieve(
        stripePaymentMethodId
      );

      if (paymentMethod.type !== "sepa_debit") {
        throw new Error("Unexpected payment method type.");
      }

      const mandate = await stripe.mandates.retrieve(stripeMandateId);

      if (mandate.status !== "active") {
        throw new Error("Stripe mandate is not active.");
      }

      const sepaDetails = paymentMethod.sepa_debit;

      if (!sepaDetails) {
        throw new Error("SEPA bank account details were not returned.");
      }

      const acceptance = mandate.customer_acceptance;
      const onlineAcceptance =
        acceptance.type === "online" ? acceptance.online : null;

      await prisma.$transaction(async (tx) => {
        const savedPaymentMethod = await tx.paymentMethod.upsert({
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
              mandate.payment_method_details.sepa_debit?.reference ?? null,
            acceptanceType: acceptance.type,
            acceptedAt: acceptance.accepted_at
              ? new Date(acceptance.accepted_at * 1000)
              : null,
            acceptanceIp: onlineAcceptance?.ip_address ?? null,
            userAgent: onlineAcceptance?.user_agent ?? null,
          },
          create: {
            customerId: customer.id,
            paymentMethodId: savedPaymentMethod.id,
            stripeMandateId,
            status: "ACTIVE",
            reference:
              mandate.payment_method_details.sepa_debit?.reference ?? null,
            acceptanceType: acceptance.type,
            acceptedAt: acceptance.accepted_at
              ? new Date(acceptance.accepted_at * 1000)
              : null,
            acceptanceIp: onlineAcceptance?.ip_address ?? null,
            userAgent: onlineAcceptance?.user_agent ?? null,
          },
        });

        await tx.webhookEvent.update({
          where: { stripeEventId: event.id },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
            errorMessage: null,
          },
        });
      });
    } else if (event.type === "setup_intent.setup_failed") {
      await prisma.webhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
        },
      });
    } else if (event.type === "payment_method.detached") {
      const detachedMethod = event.data.object;

      await prisma.$transaction(async (tx) => {
        const savedMethod = await tx.paymentMethod.findUnique({
          where: {
            stripePaymentMethodId: detachedMethod.id,
          },
        });

        if (savedMethod) {
          await tx.paymentMethod.update({
            where: { id: savedMethod.id },
            data: { status: "DETACHED" },
          });

          await tx.mandate.updateMany({
            where: {
              paymentMethodId: savedMethod.id,
              status: "ACTIVE",
            },
            data: { status: "INACTIVE" },
          });
        }

        await tx.webhookEvent.update({
          where: { stripeEventId: event.id },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
          },
        });
      });
    } else {
      // Acknowledge events we do not currently process.
      await prisma.webhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      received: true,
      eventId: event.id,
      processed: true,
    });
  } catch (error) {
    console.error("Stripe webhook processing error:", error);

    await prisma.webhookEvent.update({
      where: { stripeEventId: event.id },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown processing error",
      },
    }).catch((dbError) => {
      console.error("Unable to update webhook event:", dbError);
    });

    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 }
    );
  }
}
