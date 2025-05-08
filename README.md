# Resume Analyzer Pro - Frontend Shell

This project is a frontend UI shell for the Resume Analyzer Pro application, built with Next.js and TailwindCSS based on the provided mockups and specifications.

## Project Overview

This shell implements the user interface for all major phases of the application:

1.  **Landing Page:** Introduction, feature highlights, and initial CTA.
2.  **Upload & Targeting:** PDF upload, job title, and description input.
3.  **Analyzing:** Loading screen simulation.
4.  **Results Dashboard:** Overview of resume score, strengths, weaknesses, and alerts.
5.  **Detailed Analysis:** Split view with PDF preview and section-specific feedback.
6.  **Improved Content:** Side-by-side comparison of original vs. AI-improved text.
7.  **Templates Gallery:** Browseable gallery of resume templates.
8.  **Report Preview:** Preview of the downloadable PDF analysis report.

## Tech Stack

*   **Framework:** Next.js (App Router)
*   **Styling:** TailwindCSS
*   **UI Components:** shadcn/ui (Button, Card, Input, Textarea, Progress, Select, etc. - *Note: Assumes these are installed/available via the template or added separately*)
*   **Icons:** Lucide React
*   **Font:** Inter

## Getting Started

### Prerequisites

*   Node.js (v18 or later recommended)
*   pnpm (or npm/yarn)

### Installation

1.  Clone the repository (or extract the provided code).
2.  Navigate to the project directory:
    ```bash
    cd resume-analyzer-pro
    ```
3.  Install dependencies:
    ```bash
    pnpm install
    # or npm install / yarn install
    ```

### Running the Development Server

1.  Start the development server:
    ```bash
    pnpm dev
    # or npm run dev / yarn dev
    ```
2.  Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Project Structure

*   `src/app/`: Contains the main application pages (routes).
    *   `layout.tsx`: Root layout.
    *   `layout_component.tsx`: Custom layout wrapper.
    *   `globals.css`: Global styles and Tailwind configuration.
    *   `page.tsx`: Landing Page (Phase 1).
    *   `upload/page.tsx`: Upload & Targeting Page (Phase 2).
    *   `analyzing/page.tsx`: Analyzing Page (Phase 3).
    *   `results/`: Directory for results pages.
        *   `page.tsx`: Results Overview Page (Phase 4).
        *   `ResultsNavTabs.tsx`: Reusable tab navigation component.
        *   `detailed/page.tsx`: Detailed Analysis Page (Phase 5).
        *   `improved/page.tsx`: Improved Content Page (Phase 6).
        *   `templates/page.tsx`: Templates Gallery Page (Phase 7).
        *   `report/page.tsx`: Report Preview Page (Phase 8).
*   `src/components/`: Contains reusable UI components (primarily from shadcn/ui).
*   `src/lib/`: Utility functions (e.g., `cn` from shadcn/ui).
*   `public/`: Static assets (e.g., placeholder images).

## Notes

*   This is a UI shell only. Backend logic, actual AI analysis, PDF parsing (beyond basic preview), and database interactions are not implemented.
*   Placeholder data is used throughout the application.
*   Responsiveness has been considered using TailwindCSS utility classes, but further testing and refinement may be needed across various devices.
*   Assumes `shadcn/ui` components are set up and available. If not, they would need to be added via `npx shadcn-ui@latest add [component-name]`.

