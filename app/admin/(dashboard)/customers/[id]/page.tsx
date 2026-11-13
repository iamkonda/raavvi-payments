
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type CustomerProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  status: string;
  createdAt: string;
  paymentMethods: {
    id: string;
    type: string;
    status: string;
    bankCountry: string | null;
    last4: string | null;
    isDefault: boolean;
    createdAt: string;
  }[];
  mandates: {
    id: string;
    status: string;
    acceptedAt: string | null;
    acceptanceType: string | null;
    reference: string | null;
    createdAt: string;
  }[];
  subscriptions: {
    id: string;
    amount: number;
    currency: string;
    interval: string;
    intervalCount: number;
    status: string;
    startDate: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
  }[];
  payments: {
    id: string;
    type: string;
    status: string;
    amount: number;
    currency: string;
    failureCode: string | null;
    failureMessage: string | null;
    paidAt: string | null;
    refundedAmount: number;
    createdAt: string;
  }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    status: string;
    dueDate: string | null;
    paidAt: string | null;
    createdAt: string;
  }[];
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Status({ value }: { value: string }) {
  const color =
    value === "ACTIVE" || value === "SUCCEEDED" || value === "PAID"
      ? "bg-green-500/10 text-green-400"
      : value === "FAILED" || value === "INACTIVE" || value === "CANCELED"
        ? "bg-red-500/10 text-red-400"
        : "bg-slate-700 text-slate-300";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs ${color}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCustomer() {
      try {
        const response = await fetch(
          `/api/admin/customers/${encodeURIComponent(params.id)}`,
          { cache: "no-store", signal: controller.signal }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load customer.");
        }

        setCustomer(data.customer);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadCustomer();

    return () => controller.abort();
  }, [params.id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-slate-400">
        Loading customer profile...
      </main>
    );
  }

  if (error || !customer) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-white">
        <p className="text-red-400">{error || "Customer not found."}</p>
        <button
          onClick={() => router.push("/admin/customers")}
          className="mt-5 text-blue-400"
        >
          Back to customers
        </button>
      </main>
    );
  }

  const activeMandates = customer.mandates.filter(
    (item) => item.status === "ACTIVE"
  ).length;

  const activeMethods = customer.paymentMethods.filter(
    (item) => item.status === "ACTIVE"
  ).length;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">

        <button
          onClick={() => router.push("/admin/customers")}
          className="mb-7 text-sm text-blue-400 hover:text-blue-300"
        >
          ← Back to customers
        </button>

        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-slate-400">Customer profile</p>
            <h1 className="mt-2 text-3xl font-bold">{customer.name}</h1>
            <p className="mt-2 text-slate-400">{customer.email}</p>
          </div>

          <Status value={customer.status} />
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Payment methods", customer.paymentMethods.length],
            ["Active methods", activeMethods],
            ["Active mandates", activeMandates],
            ["Subscriptions", customer.subscriptions.length],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5"
            >
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 text-lg font-semibold">Customer information</h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Full name", customer.name],
              ["Email", customer.email],
              ["Phone", customer.phone],
              ["Country", customer.country],
              ["City", customer.city],
              ["State", customer.state],
              ["Postal code", customer.postalCode],
              ["Address line 1", customer.addressLine1],
              ["Address line 2", customer.addressLine2],
              ["Registered", formatDate(customer.createdAt)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-sm text-slate-200">{value || "—"}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 text-lg font-semibold">SEPA payment methods</h2>

          {customer.paymentMethods.length === 0 ? (
            <p className="text-sm text-slate-400">No payment methods found.</p>
          ) : (
            <div className="space-y-3">
              {customer.paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-4"
                >
                  <div>
                    <p className="font-medium">SEPA Direct Debit</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {method.bankCountry || "Unknown country"}
                      {method.last4 ? ` ···· ${method.last4}` : ""}
                      {method.isDefault ? " · Default method" : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Added {formatDate(method.createdAt)}
                    </p>
                  </div>
                  <Status value={method.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 text-lg font-semibold">SEPA mandates</h2>

          {customer.mandates.length === 0 ? (
            <p className="text-sm text-slate-400">No mandates found.</p>
          ) : (
            <div className="space-y-3">
              {customer.mandates.map((mandate) => (
                <div
                  key={mandate.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-4"
                >
                  <div>
                    <p className="font-medium">
                      {mandate.reference || "SEPA mandate"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      Authorized: {formatDate(mandate.acceptedAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Created: {formatDate(mandate.createdAt)}
                    </p>
                  </div>
                  <Status value={mandate.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 text-lg font-semibold">Subscriptions</h2>

          {customer.subscriptions.length === 0 ? (
            <p className="text-sm text-slate-400">
              No subscriptions have been created for this customer.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-3 pr-4">Amount</th>
                    <th className="py-3 pr-4">Frequency</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Next period end</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.subscriptions.map((subscription) => (
                    <tr key={subscription.id} className="border-t border-slate-800">
                      <td className="py-4 pr-4">
                        {formatMoney(subscription.amount, subscription.currency)}
                      </td>
                      <td className="py-4 pr-4">
                        {subscription.intervalCount > 1
                          ? `Every ${subscription.intervalCount} ${subscription.interval.toLowerCase()}`
                          : `Every ${subscription.interval.toLowerCase()}`}
                      </td>
                      <td className="py-4 pr-4">
                        <Status value={subscription.status} />
                      </td>
                      <td className="py-4 pr-4 text-slate-400">
                        {formatDate(subscription.currentPeriodEnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 text-lg font-semibold">Recent payments</h2>

          {customer.payments.length === 0 ? (
            <p className="text-sm text-slate-400">No payments recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 pr-4">Type</th>
                    <th className="py-3 pr-4">Amount</th>
                    <th className="py-3 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-slate-800">
                      <td className="py-4 pr-4">{formatDate(payment.createdAt)}</td>
                      <td className="py-4 pr-4">{payment.type.replaceAll("_", " ")}</td>
                      <td className="py-4 pr-4">
                        {formatMoney(payment.amount, payment.currency)}
                      </td>
                      <td className="py-4 pr-4"><Status value={payment.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 text-lg font-semibold">Invoices</h2>

          {customer.invoices.length === 0 ? (
            <p className="text-sm text-slate-400">No invoices recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-3 pr-4">Invoice</th>
                    <th className="py-3 pr-4">Amount</th>
                    <th className="py-3 pr-4">Due date</th>
                    <th className="py-3 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-t border-slate-800">
                      <td className="py-4 pr-4">{invoice.invoiceNumber}</td>
                      <td className="py-4 pr-4">
                        {formatMoney(invoice.amount, invoice.currency)}
                      </td>
                      <td className="py-4 pr-4">{formatDate(invoice.dueDate)}</td>
                      <td className="py-4 pr-4"><Status value={invoice.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
