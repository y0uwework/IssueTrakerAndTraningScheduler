import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Joiners",
  description: "New joiner details from the HR joining sheet, with HRMS and CRM training status.",
};

export default function EmployeesLayout({ children }: LayoutProps<"/employees">) {
  return children;
}
