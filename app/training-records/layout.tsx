import { pageMetadata } from "@/lib/sidebar-config";

export const metadata = pageMetadata("/training-records");

export default function TrainingRecordsLayout({ children }: LayoutProps<"/training-records">) {
  return children;
}
