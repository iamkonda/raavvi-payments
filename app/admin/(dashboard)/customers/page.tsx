
"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  name: string;
  email: string;
  country: string | null;
  status: string;
  createdAt: string;
  paymentMethods: {
    id: string;
    type: string;
    status: string;
    bankCountry: string | null;
    last4: string | null;
    isDefault: boolean;
  }[];
  mandates: {
    id: string;
    status: string;
    acceptedAt: string | null;
    reference: string | null;
  }[];
  _count: {
    subscriptions: number;
    payments: number;
    invoices: number;
  };
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCustomers() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          search,
          page: String(page),
        });

        const response = await fetch(
          `/api/admin/customers?${params.toString()}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load customers.");
        }

        setCustomers(data.customers);
        setTotal(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadCustomers();

    return () => controller.abort();
  }, [search, page]);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm text-slate-400">Billing administration</p>
          <h1 className="mt-2 text-3xl font-bold">Customers</h1>
          <p className="mt-2 text-slate-400">
            View customers, payment methods and SEPA mandate status.
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-400">Total customers</p>
            <p className="mt-1 text-3xl font-bold">{total}</p>
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500 sm:max-w-sm"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/70 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Country</th>
                  <th className="px-6 py-4">Payment method</th>
                  <th className="px-6 py-4">Mandate</th>
                  <th className="px-6 py-4">Subscriptions</th>
                  <th className="px-6 py-4">Registered</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      Loading customers...
                    </td>
                  </tr>
                )}

                {!loading && error && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-red-400">
                      {error}
                    </td>
                  </tr>
                )}

                {!loading && !error && customers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      No customers found.
                    </td>
                  </tr>
                )}

                {!loading && !error && customers.map((customer) => {
                  const activeMethod = customer.paymentMethods.find(
                    (method) => method.status === "ACTIVE"
                  );

                  const activeMandate = customer.mandates.find(
                    (mandate) => mandate.status === "ACTIVE"
                  );

                  return (
                    <tr
                      key={customer.id}
                      onClick={() => window.location.href = `/admin/customers/${customer.id}`}
                      className="cursor-pointer transition hover:bg-slate-800/70"
                    >
                      <td className="px-6 py-5">
                        <p className="font-medium text-white">
                          {customer.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {customer.email}
                        </p>
                      </td>

                      <td className="px-6 py-5 text-slate-300">
                        {customer.country || "—"}
                      </td>

                      <td className="px-6 py-5">
                        {activeMethod ? (
                          <div>
                            <span className="text-green-400">SEPA Direct Debit</span>
                            <p className="mt-1 text-xs text-slate-400">
                              {activeMethod.bankCountry || "Bank country unavailable"}
                              {activeMethod.last4 ? ` ···· ${activeMethod.last4}` : ""}
                              {activeMethod.isDefault ? " · Default" : ""}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-500">No active method</span>
                        )}
                      </td>

                      <td className="px-6 py-5">
                        <span className={
                          activeMandate
                            ? "rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400"
                            : "rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-300"
                        }>
                          {activeMandate ? "Active" : "No active mandate"}
                        </span>
                      </td>

                      <td className="px-6 py-5 text-slate-300">
                        {customer._count.subscriptions}
                      </td>

                      <td className="px-6 py-5 text-slate-400">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
            <p className="text-xs text-slate-400">
              Showing {customers.length} of {total} customers
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>

              <span className="text-xs text-slate-400">
                Page {page} of {Math.max(1, totalPages)}
              </span>

              <button
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= totalPages || loading}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
