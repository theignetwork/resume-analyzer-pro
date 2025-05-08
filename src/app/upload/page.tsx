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

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    validateAndSetFile(selectedFile);
  };

  // Handle drag & drop
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

  // Validate the file
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
    
    console.log("File selected:", selectedFile.name);
    setFile(selectedFile);
    setFileName(selectedFile.name);
  };

  // Handle submit
  const handleSubmit = async () => {
    console.log("Submit button clicked");
    
    // Validate inputs
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
      
      // 1. Upload PDF to Supabase Storage
      console.log("Uploading file to Supabase Storage...");
      const fileExt = fileName.split('.').pop();
      const filePath = `resumes/${Date.now()}-${fileName}`;
      
      const { data: fileData, error: uploadError } = await supabase.storage
        .from('resume-files') // Make sure this bucket exists in Supabase
        .upload(filePath, file);
      
      if (uploadError) {
        throw uploadError;
      }
      
      console.log("File uploaded successfully:", filePath);
      
      // 2. Get public URL for the file
      const { data: urlData } = await supabase.storage
        .from('resume-files')
        .getPublicUrl(filePath);
      
      const fileUrl = urlData.publicUrl;
      console.log("File public URL:", fileUrl);
      
      // 3. Store metadata in the database
      console.log("Saving metadata to database...");
      const { data: resumeData, error: dbError } = await supabase
        .from('resumes')
        .insert({
          file_name: fileName,
          job_title: jobTitle,
          job_description: jobDescription,
          file_url: fileUrl
        })
        .select('id')
        .single();
      
      if (dbError) {
        throw dbError;
      }
      
      console.log("Data saved to database:", resumeData);
      
      // 4. Store resume ID in localStorage for next step
      localStorage.setItem('currentResumeId', resumeData.id);
      
      // 5. Navigate to analyzing page
      router.push('/analyzing');
      
    } catch (err) {
      console.error('Error:', err);
      setError('Error processing resume: ' + (err.message || 'Unknown error'));
      setLoading(false);
    }
  };

  // Return the UI (unchanged from your original code)
  return (
    <div className="flex flex-col items-center text-center space-y-8">
      <h1 className="text-4xl font-bold text-white">RESUME ANALYZER PRO</h1>
      <p className="text-lg text-primary">Step 1 of 3 - Upload & Targeting</p>
      
      {/* Upload Area */}
      <div 
        className={`w-full max-w-2xl bg-card/50 backdrop-blur-sm border-2 border-dashed ${file ? 'border-green-500' : 'border-primary/50'} rounded-lg p-12 flex flex-col items-center justify-center space-y-4 hover:border-primary transition-all duration-300 cursor-pointer`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload').click()}
      >
        <input 
          id="file-upload" 
          type="file" 
          accept=".pdf" 
          className="hidden" 
          onChange={handleFileChange}
        />
        
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
      
      {/* Input Fields */}
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
      
      {/* Navigation Buttons */}
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



