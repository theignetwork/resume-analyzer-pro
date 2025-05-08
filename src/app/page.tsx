// Phase 1: Landing Page Component
import React from 'react';
import { Button } from "@/components/ui/button"; // Assuming shadcn/ui button
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Assuming shadcn/ui card
import { CheckCircle, BarChart2, Sparkles } from 'lucide-react'; // Icons

const LandingPage = () => {
  return (
    <div className="flex flex-col items-center text-center space-y-12">
      {/* Hero Section */}
      <div className="relative flex flex-col items-center space-y-4 mt-16">
        <h1 className="text-5xl md:text-6xl font-bold text-white">RESUME ANALYZER PRO</h1>
        <p className="text-xl text-muted-foreground">
          AI-Powered Resume Feedback to Get You More Interviews, Faster.
        </p>
        {/* Score Teaser - Placeholder styling */}
        <div className="relative mt-8 flex justify-center items-center w-48 h-48 border-4 border-primary/30 rounded-full">
          <span className="text-6xl font-bold text-primary animate-pulse">75</span>
          {/* Add shimmer/glow effect later */}
        </div>
        <Button size="lg" className="mt-[-2rem] z-10 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg px-10 py-6 rounded-lg shadow-lg shadow-primary/30 hover:shadow-primary/40 transition-all duration-300 transform hover:scale-105">
          UPLOAD RESUME
        </Button>
        <p className="text-sm text-muted-foreground mt-4">
          Real users improved their score from 62 → 88 in one click.
        </p>
      </div>

      {/* Feature Highlights Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl pt-12">
        {/* Card 1: ATS Optimization */}
        <Card className="bg-card/80 backdrop-blur-sm border-primary/20 hover:border-primary/50 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-primary/20">
          <CardHeader className="items-center">
            <CheckCircle className="w-10 h-10 text-primary mb-2" />
            <CardTitle className="text-white">ATS Optimization</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Improve compatibility with Applicant Tracking Systems.
          </CardContent>
        </Card>

        {/* Card 2: Resume Score Breakdown */}
        <Card className="bg-card/80 backdrop-blur-sm border-primary/20 hover:border-primary/50 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-primary/20">
          <CardHeader className="items-center">
            <BarChart2 className="w-10 h-10 text-primary mb-2" />
            <CardTitle className="text-white">Resume Score Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Get a detailed analysis of your resume's strengths.
          </CardContent>
        </Card>

        {/* Card 3: Resume Auto-Upgrade */}
        <Card className="bg-card/80 backdrop-blur-sm border-primary/20 hover:border-primary/50 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-primary/20">
          <CardHeader className="items-center">
            <Sparkles className="w-10 h-10 text-primary mb-2 animate-pulse" />
            <CardTitle className="text-white">Resume Auto-Upgrade ✨</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Paste in your resume, get improved content. Simple.
          </CardContent>
        </Card>
      </div>

      {/* FAQ Section Placeholder */}
      <div className="w-full max-w-3xl pt-12">
        <h2 className="text-3xl font-bold text-white mb-6">Frequently Asked Questions</h2>
        {/* Placeholder for Accordion component */}
        <div className="space-y-4 text-left">
          <div className="bg-card/50 p-4 rounded-lg border border-border">
            <h3 className="font-semibold text-white">How does the scoring work?</h3>
            <p className="text-muted-foreground mt-2">Our AI analyzes your resume against industry benchmarks and ATS compatibility factors.</p>
          </div>
          <div className="bg-card/50 p-4 rounded-lg border border-border">
            <h3 className="font-semibold text-white">Is my data secure?</h3>
            <p className="text-muted-foreground mt-2">Yes, we prioritize data privacy and security. Your resume data is processed securely.</p>
          </div>
          {/* Add more placeholder FAQs */} 
        </div>
      </div>

    </div>
  );
};

export default LandingPage;

