
"use client";

import { useCallback, useEffect, useState } from "react";

type PaymentMethod = {
  id: string;
  type: string;
  status: string;
  bankCountry: string | null;
  last4: string | null;
  isDefault: boolean;
};

type Customer = {
  id: string;
  name: string;
  email: string;
  country: string | null;
  paymentMethods: PaymentMethod[];
};

type Subscription = {
  id: string;
  customerId: string;
  amount: number;
  currency: string;
  interval: "WEEK" | "MONTH" | "YEAR";
  intervalCount: number;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
  customer: {
    name: string;
    email: string;
    country: string | null;
  };
  paymentMethod: {
    bankCountry: string | null;
    last4: string | null;
  };
};

export default function SubscriptionsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState("MONTH");
  const [intervalCount, setIntervalCount] = useState("1");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );

  const eligibleMethods = selectedCustomer?.paymentMethods ?? [];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // Load all customer pages because the customers API
      // returns a maximum of 10 customers per page.
      const firstResponse = await fetch(
        "/api/admin/customers?page=1"
      );
      const firstData = await firstResponse.json();

      if (!firstResponse.ok) {
        throw new Error(firstData.error || "Unable to load customers.");
      }

      let allCustomers: Customer[] = firstData.customers ?? [];

      const totalPages = firstData.pagination?.totalPages ?? 1;

      if (totalPages > 1) {
        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            fetch(`/api/admin/customers?page=${index + 2}`)
              .then((response) => response.json())
          )
        );

        for (const page of remainingPages) {
          allCustomers = allCustomers.concat(page.customers ?? []);
        }
      }

      const subscriptionsResponse = await fetch(
        "/api/admin/subscriptions"
      );
      const subscriptionsData = await subscriptionsResponse.json();

      if (!subscriptionsResponse.ok) {
        throw new Error(
          subscriptionsData.error || "Unable to load subscriptions."
        );
      }

      setCustomers(allCustomers);
      setSubscriptions(subscriptionsData.subscriptions ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const defaultMethod = eligibleMethods.find(
      (method) => method.isDefault
    );

    setPaymentMethodId(
      defaultMethod?.id ?? eligibleMethods[0]?.id ?? ""
    );
  }, [customerId, customers]);

  async function createSubscription(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setCreating(true);
    setMessage("");
    setError("");

    try {
      const amountInCents = Math.round(Number(amount) * 100);

      if (!Number.isFinite(amountInCents) || amountInCents < 50) {
        throw new Error("Minimum subscription amount is €0.50.");
      }

      if (!customerId || !paymentMethodId) {
        throw new Error("Select a customer with an active SEPA mandate.");
      }

      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId,
          paymentMethodId,
          amount: amountInCents,
          currency: "eur",
          interval,
          intervalCount: Number(intervalCount),
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to create subscription.");
      }

      setMessage(
        "Subscription created. The initial SEPA collection may remain processing until the bank confirms it."
      );

      setAmount("");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setCreating(false);
    }
  }

  function formatAmount(value: number, currency: string) {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value / 100);
  }

  function statusStyle(status: string) {
    switch (status) {
      case "ACTIVE":
        return "bg-green-500/10 text-green-400";
      case "PAST_DUE":
      case "UNPAID":
      case "INCOMPLETE":
        return "bg-yellow-500/10 text-yellow-400";
      case "CANCELED":
      case "INCOMPLETE_EXPIRED":
        return "bg-red-500/10 text-red-400";
      default:
        return "bg-slate-700 text-slate-300";
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Subscriptions</h1>
            <p className="mt-2 text-sm text-slate-400">
              Create and monitor recurring SEPA Direct Debit collections.
            </p>
          </div>

          <button
            onClick={() => void loadData()}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        {message && (
          <div className="mb-6 rounded-lg border border-green-800 bg-green-950/40 p-4 text-sm text-green-300">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="mb-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-6 text-xl font-semibold">
            Create subscription
          </h2>

          <form onSubmit={createSubscription} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Customer
              </label>

              <select
                required
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
              >
                <option value="">Select customer</option>

                {customers
                  .filter((customer) => customer.paymentMethods.length > 0)
                  .map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} — {customer.email}
                    </option>
                  ))}
              </select>

              {customers.length === 0 && !loading && (
                <p className="mt-2 text-xs text-slate-500">
                  No registered customers found.
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                SEPA payment method
              </label>

              <select
                required
                value={paymentMethodId}
                onChange={(event) =>
                  setPaymentMethodId(event.target.value)
                }
                disabled={!eligibleMethods.length}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white disabled:opacity-50"
              >
                <option value="">Select payment method</option>

                {eligibleMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    SEPA Debit •••• {method.last4 ?? "****"} (
                    {method.bankCountry ?? "Unknown country"})
                    {method.isDefault ? " — Default" : ""}
                  </option>
                ))}
              </select>

              {customerId && eligibleMethods.length === 0 && (
                <p className="mt-2 text-xs text-yellow-400">
                  This customer has no active SEPA mandate.
                </p>
              )}
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Amount (EUR)
                </label>

                <input
                  required
                  type="number"
                  min="0.50"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="100.00"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Billing frequency
                </label>

                <select
                  value={interval}
                  onChange={(event) => setInterval(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                >
                  <option value="WEEK">Weekly</option>
                  <option value="MONTH">Monthly</option>
                  <option value="YEAR">Yearly</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Every
                </label>

                <select
                  value={intervalCount}
                  onChange={(event) =>
                    setIntervalCount(event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={
                creating ||
                loading ||
                !customerId ||
                !paymentMethodId
              }
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create subscription"}
            </button>

            <p className="text-xs leading-5 text-slate-500">
              Creating a subscription initiates its first collection.
              SEPA payments are asynchronous and are not immediately
              considered successful.
            </p>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <h2 className="text-xl font-semibold">
              Subscription history
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {subscriptions.length} subscription(s)
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400">
              Loading subscriptions...
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium">No subscriptions yet</p>
              <p className="mt-2 text-sm text-slate-400">
                Create your first subscription using the form above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Frequency</th>
                    <th className="px-6 py-4">SEPA account</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Next billing date</th>
                  </tr>
                </thead>

                <tbody>
                  {subscriptions.map((subscription) => (
                    <tr
                      key={subscription.id}
                      className="border-t border-slate-800"
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium">
                          {subscription.customer.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {subscription.customer.email}
                        </p>
                      </td>

                      <td className="px-6 py-4 font-medium">
                        {formatAmount(
                          subscription.amount,
                          subscription.currency
                        )}
                      </td>

                      <td className="px-6 py-4">
                        Every {subscription.intervalCount}{" "}
                        {subscription.interval.toLowerCase()}
                        {subscription.intervalCount > 1 ? "s" : ""}
                      </td>

                      <td className="px-6 py-4 text-slate-300">
                        •••• {subscription.paymentMethod.last4 ?? "****"}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle(
                            subscription.status
                          )}`}
                        >
                          {subscription.status.replaceAll("_", " ")}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-slate-300">
                        {subscription.currentPeriodEnd
                          ? new Date(
                              subscription.currentPeriodEnd
                            ).toLocaleDateString()
                          : "Not available yet"}
                      </td>
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
