'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const UploadPage = () => {
  const router = useRouter();

  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    validateAndSetFile(selectedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    setError('');
    if (!selectedFile) {
      setError('No file selected');
      return;
    }
    if (selectedFile.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }
    setFile(selectedFile);
    setFileName(selectedFile.name);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Please upload a resume');
      return;
    }
    if (!jobTitle.trim()) {
      setError('Please enter a job title');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const filePath = `resumes/${Date.now()}-${fileName}`;
      const { data: fileData, error: uploadError } = await supabase.storage
        .from('resume-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from('resume-files')
        .getPublicUrl(filePath);

      const fileUrl = urlData.publicUrl;

      const { data: resumeData, error: dbError } = await supabase
        .from('resumes')
        .insert({
          file_name: fileName,
          job_title: jobTitle,
          job_description: jobDescription,
          file_url: fileUrl,
          documentType: 'oprLlBoq'
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      const resumeId = resumeData.id;

      // Wait for parser to populate resume_text (polling every 2 seconds, max 20 seconds)
      let parsed = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data: updatedResume, error: pollError } = await supabase
          .from('resumes')
          .select('resume_text')
          .eq('id', resumeId)
          .single();

        if (pollError) throw pollError;

        if (updatedResume?.resume_text) {
          parsed = true;
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!parsed) {
        throw new Error('Resume parsing timed out. Please try again.');
      }

      // Trigger analysis API
      const analyzeResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId })
      });

      const analyzeData = await analyzeResponse.json();

      if (!analyzeResponse.ok || !analyzeData.analysisId) {
        throw new Error(analyzeData.error || 'Failed to analyze resume');
      }

      localStorage.setItem('currentAnalysisId', analyzeData.analysisId);
      router.push(`/analyzing?id=${analyzeData.analysisId}`);

    } catch (err) {
      console.error('Error:', err);
      setError('Error processing resume: ' + (err.message || 'Unknown error'));
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center text-center space-y-8">
      <h1 className="text-4xl font-bold text-white">RESUME ANALYZER PRO</h1>
      <p className="text-lg text-primary">Step 1 of 3 - Upload & Targeting</p>

      <div
        className={`w-full max-w-2xl bg-card/50 backdrop-blur-sm border-2 border-dashed ${file ? 'border-green-500' : 'border-primary/50'} rounded-lg p-12 flex flex-col items-center justify-center space-y-4 hover:border-primary transition-all duration-300 cursor-pointer`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload').click()}
      >
        <input id="file-upload" type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        {file ? (
          <>
            <CheckCircle className="w-16 h-16 text-green-500" />
            <p className="text-white">{fileName}</p>
          </>
        ) : (
          <>
            <UploadCloud className="w-16 h-16 text-primary/70" />
            <p className="text-muted-foreground">Drag & drop your resume (PDF only)</p>
            <Button variant="outline" className="border-primary text-primary hover:bg-primary/10 hover:text-primary">
              Or Browse Files
            </Button>
          </>
        )}
      </div>

      {error && <p className="text-red-500">{error}</p>}

      <div className="w-full max-w-2xl space-y-4">
        <Input
          type="text"
          placeholder="Target Job Title"
          className="bg-input border-border focus:border-primary focus:ring-primary rounded-lg p-4 text-white placeholder:text-muted-foreground"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        />
        <Textarea
          placeholder="Job Description"
          className="bg-input border-border focus:border-primary focus:ring-primary rounded-lg p-4 min-h-[150px] text-white placeholder:text-muted-foreground"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />
      </div>

      <div className="w-full max-w-2xl flex justify-between items-center pt-4">
        <Link href="/" passHref>
          <Button variant="link" className="text-muted-foreground hover:text-white">← Previous</Button>
        </Link>
        <Button
          size="lg"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-3 rounded-lg shadow-lg shadow-primary/30 hover:shadow-primary/40 transition-all duration-300"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Analyze Resume'}
        </Button>
      </div>
    </div>
  );
};

export default UploadPage;

