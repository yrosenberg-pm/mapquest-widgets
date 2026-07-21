import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Demo · MapQuest Widgets',
  description: 'Video demo canvas for Truck Routing widget assembly',
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
