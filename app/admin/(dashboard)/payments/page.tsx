
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

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
  paymentMethods: PaymentMethod[];
};

type Payment = {
  id: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  createdAt: string;
  failureMessage?: string | null;
  customer: {
    id: string;
    name: string;
    email: string;
  };
  paymentMethod?: {
    type: string;
    bankCountry: string | null;
    last4: string | null;
  } | null;
};

export default function PaymentsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("1.00");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );

  const availableMethods =
    selectedCustomer?.paymentMethods ?? [];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // Load customers, including all pages.
      const firstResponse = await fetch(
        "/api/admin/customers?page=1"
      );

      const firstData = await firstResponse.json();

      if (!firstResponse.ok) {
        throw new Error(
          firstData.error || "Unable to load customers."
        );
      }

      let allCustomers: Customer[] = firstData.customers ?? [];

      const totalPages =
        firstData.pagination?.totalPages ?? 1;

      for (let page = 2; page <= totalPages; page++) {
        const response = await fetch(
          `/api/admin/customers?page=${page}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Unable to load customers."
          );
        }

        allCustomers = [
          ...allCustomers,
          ...(data.customers ?? []),
        ];
      }

      setCustomers(allCustomers);

      // Load one-time payment history.
      const paymentResponse = await fetch(
        "/api/admin/payments"
      );

      const paymentData = await paymentResponse.json();

      if (!paymentResponse.ok) {
        throw new Error(
          paymentData.error || "Unable to load payments."
        );
      }

      setPayments(paymentData.payments ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load payment data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedCustomer) {
      setPaymentMethodId("");
      return;
    }

    const defaultMethod = availableMethods.find(
      (method) => method.isDefault
    );

    setPaymentMethodId(
      defaultMethod?.id ?? availableMethods[0]?.id ?? ""
    );
  }, [customerId, customers]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount < 0.5
    ) {
      setError("Minimum payment amount is €0.50.");
      return;
    }

    if (!customerId || !paymentMethodId) {
      setError("Select a customer and SEPA payment method.");
      return;
    }

    if (!description.trim()) {
      setError("Enter a payment description.");
      return;
    }

    if (
      !window.confirm(
        `Initiate a SEPA Direct Debit of €${numericAmount.toFixed(
          2
        )} for ${selectedCustomer?.name}?`
      )
    ) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId,
          paymentMethodId,
          amount: Math.round(numericAmount * 100),
          description: description.trim(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.details || data.error || "Payment failed."
        );
      }

      setSuccess(
        `${data.message} Stripe status: ${data.payment.stripeStatus}.`
      );

      setDescription("");

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to initiate payment."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function formatAmount(value: number, currency: string) {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value / 100);
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString();
  }

  function statusStyle(status: string) {
    switch (status) {
      case "SUCCEEDED":
        return "bg-emerald-500/10 text-emerald-400";
      case "PROCESSING":
      case "PENDING":
        return "bg-amber-500/10 text-amber-400";
      case "FAILED":
      case "CANCELED":
        return "bg-red-500/10 text-red-400";
      default:
        return "bg-slate-500/10 text-slate-300";
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-10 p-6 text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            One-time Payments
          </h1>
          <p className="mt-2 text-slate-400">
            Initiate and monitor individual SEPA Direct Debit
            collections.
          </p>
        </div>

        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="rounded-lg border border-slate-700 px-5 py-2 hover:bg-slate-800 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300">
          {success}
        </div>
      )}

      {/* Create payment */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-6 text-xl font-semibold">
          Initiate one-time payment
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Customer
            </label>

            <select
              value={customerId}
              onChange={(event) =>
                setCustomerId(event.target.value)
              }
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
            >
              <option value="">Select customer</option>

              {customers
                .filter(
                  (customer) =>
                    customer.paymentMethods.length > 0
                )
                .map((customer) => (
                  <option
                    key={customer.id}
                    value={customer.id}
                  >
                    {customer.name} — {customer.email}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">
              SEPA payment method
            </label>

            <select
              value={paymentMethodId}
              onChange={(event) =>
                setPaymentMethodId(event.target.value)
              }
              required
              disabled={!customerId}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 disabled:opacity-50"
            >
              <option value="">
                Select payment method
              </option>

              {availableMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  SEPA Direct Debit
                  {method.bankCountry
                    ? ` — ${method.bankCountry}`
                    : ""}
                  {method.last4
                    ? ` — **** ${method.last4}`
                    : ""}
                  {method.isDefault ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Amount (EUR)
              </label>

              <input
                type="number"
                min="0.50"
                step="0.01"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Payment description
              </label>

              <input
                type="text"
                maxLength={500}
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                placeholder="e.g. API usage charges"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={
              submitting ||
              loading ||
              !customerId ||
              !paymentMethodId
            }
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? "Initiating payment..."
              : "Initiate payment"}
          </button>

          <p className="text-xs leading-5 text-slate-500">
            SEPA Direct Debit is asynchronous. Initiating a
            payment does not mean the funds have settled.
            Payments remain pending or processing until Stripe
            confirms their outcome.
          </p>
        </form>
      </section>

      {/* Payment history */}
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-6">
          <h2 className="text-xl font-semibold">
            One-time payment history
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            {payments.length} payment(s)
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400">
            Loading payments...
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-300">
              No one-time payments yet.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Your individual SEPA collections will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/70 text-slate-400">
                <tr>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Description</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">SEPA account</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>

              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-t border-slate-800"
                  >
                    <td className="p-4">
                      <div className="font-medium">
                        {payment.customer.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {payment.customer.email}
                      </div>
                    </td>

                    <td className="p-4">
                      One-time SEPA payment
                    </td>

                    <td className="whitespace-nowrap p-4 text-slate-400">
                      {formatDate(payment.createdAt)}
                    </td>

                    <td className="p-4 text-slate-400">
                      {payment.paymentMethod?.last4
                        ? `**** ${payment.paymentMethod.last4}`
                        : "SEPA Direct Debit"}
                    </td>

                    <td className="whitespace-nowrap p-4 font-medium">
                      {formatAmount(
                        payment.amount,
                        payment.currency
                      )}
                    </td>

                    <td className="p-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusStyle(
                          payment.status
                        )}`}
                      >
                        {payment.status}
                      </span>

                      {payment.failureMessage && (
                        <p className="mt-1 max-w-xs text-xs text-red-400">
                          {payment.failureMessage}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
