import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Training Records",
  description: "Schedule HRMS and CRM training and record who was trained, by whom.",
};

export default function TrainingRecordsLayout({ children }: LayoutProps<"/training-records">) {
  return children;
}
