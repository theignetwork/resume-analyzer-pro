// Component for Results Pages Tab Navigation
"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from "@/lib/utils"; // Assuming shadcn/ui utility

const tabs = [
  { name: 'Overview', href: '/results' },
  { name: 'ATS Optimization', href: '/results/detailed' },
  { name: 'Improved Content', href: '/results/improved' },
  { name: 'History', href: '/results/history' },
];

const ResultsNavTabs = () => {
  const pathname = usePathname();

  return (
    <nav className="mb-8 border-b border-border">
      <ul className="flex space-x-6">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <li key={tab.name}>
              <Link href={tab.href} passHref>
                <span
                  className={cn(
                    "inline-block py-3 px-1 border-b-2 font-medium text-lg",
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-white hover:border-muted-foreground'
                  )}
                >
                  {tab.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default ResultsNavTabs;