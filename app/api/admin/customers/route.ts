
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getAdminSession } from "../../../../lib/auth";

export async function GET(request: Request) {
  try {
    const admin = await getAdminSession();

    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(
      1,
      Number.parseInt(searchParams.get("page") || "1", 10) || 1
    );

    const limit = 10;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          country: true,
          status: true,
          createdAt: true,
          paymentMethods: {
            where: {
              type: "SEPA_DEBIT",
              status: "ACTIVE",
              mandates: {
                some: {
                  status: "ACTIVE",
                },
              },
            },
            select: {
              id: true,
              type: true,
              status: true,
              bankCountry: true,
              last4: true,
              isDefault: true,
            },
          },
          mandates: {
            select: {
              id: true,
              status: true,
              acceptedAt: true,
              reference: true,
            },
          },
          _count: {
            select: {
              subscriptions: true,
              payments: true,
              invoices: true,
            },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Admin customers API error:", error);

    return NextResponse.json(
      { error: "Unable to retrieve customers." },
      { status: 500 }
    );
  }
}
