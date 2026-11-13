
import { getAdminSession } from "../../../lib/auth";

const sections = [
  {
    title: "Customers",
    description: "Manage customer profiles and account details.",
    href: "/admin/customers",
    icon: "👥",
  },
  {
    title: "Mandates",
    description: "View SEPA authorizations and mandate statuses.",
    href: "/admin/mandates",
    icon: "🏦",
  },
  {
    title: "Subscriptions",
    description: "Create and manage recurring billing.",
    href: "/admin/subscriptions",
    icon: "🔁",
  },
  {
    title: "Payments",
    description: "Manage one-time collections and payment history.",
    href: "/admin/payments",
    icon: "💳",
  },
  {
    title: "Invoices",
    description: "Create and manage customer invoices.",
    href: "/admin/invoices",
    icon: "🧾",
  },
];

export default async function AdminDashboardPage() {
  const admin = await getAdminSession();

  if (!admin) return null;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Billing Admin</h1>
            <p className="text-sm text-slate-400">
              SEPA Billing Management Platform
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm font-medium">{admin.name}</p>
            <p className="text-xs text-blue-400">{admin.role}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-10">
          <p className="text-sm text-slate-400">Administrator overview</p>
          <h2 className="mt-2 text-3xl font-bold">
            Welcome back, {admin.name}
          </h2>
          <p className="mt-2 text-slate-400">
            Manage customers, SEPA mandates and billing operations.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <a
              key={section.title}
              href={section.href}
              className="group rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-blue-500 hover:bg-slate-800"
            >
              <div className="mb-5 text-3xl">{section.icon}</div>

              <h3 className="text-lg font-semibold group-hover:text-blue-400">
                {section.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                {section.description}
              </p>

              <p className="mt-5 text-sm font-medium text-blue-400">
                Open section →
              </p>
            </a>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="font-semibold">Platform status</h3>
          <p className="mt-2 text-sm text-slate-400">
            Administrator authentication is enabled. Customer and billing
            modules will be connected in the next development steps.
          </p>
        </div>
      </div>
    </main>
  );
}
