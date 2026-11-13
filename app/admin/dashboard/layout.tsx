
import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/auth";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminSession();

  if (!admin) {
    redirect("/admin/login");
  }

  return <>{children}</>;
}
