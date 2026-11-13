
import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getAdminSession } from "../../../../../lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminSession();

    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        paymentMethods: {
          select: {
            id: true,
            type: true,
            status: true,
            bankCountry: true,
            last4: true,
            isDefault: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        mandates: {
          select: {
            id: true,
            status: true,
            acceptedAt: true,
            acceptanceType: true,
            reference: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        subscriptions: {
          select: {
            id: true,
            amount: true,
            currency: true,
            interval: true,
            intervalCount: true,
            status: true,
            startDate: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        payments: {
          select: {
            id: true,
            type: true,
            status: true,
            amount: true,
            currency: true,
            failureCode: true,
            failureMessage: true,
            paidAt: true,
            refundedAmount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            amount: true,
            currency: true,
            status: true,
            dueDate: true,
            paidAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      customer,
    });
  } catch (error) {
    console.error("Customer details API error:", error);

    return NextResponse.json(
      { error: "Unable to retrieve customer details." },
      { status: 500 }
    );
  }
}
