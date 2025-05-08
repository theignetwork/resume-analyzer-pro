// Phase 7: Templates Gallery Component
"use client";

import React from 'react';
import ResultsNavTabs from '../ResultsNavTabs'; // Adjust path as needed
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Assuming shadcn/ui select
import Image from 'next/image'; // For placeholder images

// Placeholder data for templates
const templates = [
  { title: 'Professional Modern', style: 'Modern', image: '/placeholder-template.png' }, // Use a real placeholder path or generate one
  { title: 'Simple Classic', style: 'Classic', image: '/placeholder-template.png' },
  { title: 'Creative', style: 'Creative', image: '/placeholder-template.png' },
  { title: 'Minimalist', style: 'Minimalist', image: '/placeholder-template.png' },
  { title: 'Elegant', style: 'Classic', image: '/placeholder-template.png' },
  { title: 'Corporate', style: 'Modern', image: '/placeholder-template.png' },
  { title: 'Functional', style: 'Minimalist', image: '/placeholder-template.png' },
  // Add more templates
];

const TemplatesGalleryPage = () => {
  // Add state for filtering later
  const [selectedStyle, setSelectedStyle] = React.useState('All');

  const filteredTemplates = templates.filter(t => selectedStyle === 'All' || t.style === selectedStyle);

  return (
    <div className="w-full space-y-8">
      <ResultsNavTabs />

      {/* Filter Controls */}
      <div className="flex justify-start mb-6">
        <Select onValueChange={setSelectedStyle} defaultValue="All">
          <SelectTrigger className="w-[180px] bg-input border-border text-white focus:border-primary focus:ring-primary">
            <SelectValue placeholder="Filter by Style" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border text-popover-foreground">
            <SelectItem value="All">All Styles</SelectItem>
            <SelectItem value="Modern">Modern</SelectItem>
            <SelectItem value="Classic">Classic</SelectItem>
            <SelectItem value="Creative">Creative</SelectItem>
            <SelectItem value="Minimalist">Minimalist</SelectItem>
          </SelectContent>
        </Select>
        {/* Add more filters like Industry later */}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template, index) => (
          <Card key={index} className="bg-card/80 backdrop-blur-sm border border-border hover:border-primary/50 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-primary/20 overflow-hidden">
            <CardHeader className="p-0">
              {/* Placeholder Image - Replace with actual template preview */}
              <div className="bg-muted/30 aspect-[3/4] flex items-center justify-center">
                 {/* Using a simple div as placeholder instead of Image component for now */}
                 <div className="w-full h-full bg-gradient-to-br from-muted/40 to-muted/60 flex items-center justify-center">
                    <span className="text-muted-foreground text-sm">Template Preview</span>
                 </div>
                 {/* <Image src={template.image} alt={template.title} width={300} height={400} className="object-cover" /> */}
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <CardTitle className="text-white text-lg text-center">{template.title}</CardTitle>
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-md">
                View Template
              </Button>
              {/* Optional: Add 'Pro' tag */}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default TemplatesGalleryPage;

