import { pageMetadata } from "@/lib/sidebar-config";

export const metadata = pageMetadata("/employees");

export default function EmployeesLayout({ children }: LayoutProps<"/employees">) {
  return children;
}
