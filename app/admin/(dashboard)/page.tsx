
import { getAdminSession } from "@/lib/auth";
export const instant = false;

const sections = [
  {
    title: "Customers",
    description: "Manage customer profiles and saved SEPA payment methods.",
    href: "/admin/customers",
    icon: "👥",
  },
  {
    title: "Subscriptions",
    description: "Create, manage and monitor recurring SEPA collections.",
    href: "/admin/subscriptions",
    icon: "🔁",
  },
  {
    title: "Payments",
    description: "Create one-time collections and monitor payment history.",
    href: "/admin/payments",
    icon: "💳",
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
          <p className="text-sm text-slate-400">
            Administrator overview
          </p>

          <h2 className="mt-2 text-3xl font-bold">
            Welcome back, {admin.name}
          </h2>

          <p className="mt-2 text-slate-400">
            Manage customers, recurring subscriptions and SEPA payments.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <a
              key={section.title}
              href={section.href}
              className="group rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-blue-500 hover:bg-slate-800"
            >
              <div className="mb-5 text-3xl">
                {section.icon}
              </div>

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
            Administrator authentication is enabled. Customer registration
            and SEPA mandate management are connected. Subscription and
            payment management are being implemented.
          </p>
        </div>
      </div>
    </main>
  );
}
