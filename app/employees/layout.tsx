import { pageMetadata } from "@/configs/sidebar-config";

export const metadata = pageMetadata("/employees");

export default function EmployeesLayout({ children }: LayoutProps<"/employees">) {
  return children;
}
