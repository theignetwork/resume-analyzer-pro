'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, CheckCircle, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import SessionBanner from '@/components/SessionBanner';

interface Session {
  id: string;
  session_name: string;
  job_title: string;
  job_description: string;
  company_name?: string;
  total_uploads: number;
  latest_score: number | null;
  updated_at: string;
}

const UploadPage = () => {
  const router = useRouter();
  const { user, loading: authLoading, contextLoaded } = useAuth();

  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Session management state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showSessionBanner, setShowSessionBanner] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Fetch user's active sessions when authenticated
  useEffect(() => {
    const fetchSessions = async () => {
      console.log('[Upload] User state:', user);

      if (!user?.user_id) {
        console.log('[Upload] No user_id found, skipping session fetch');
        return;
      }

      console.log('[Upload] Fetching sessions for user:', user.user_id);
      setSessionsLoading(true);
      try {
        const url = `/api/sessions?wp_user_id=${user.user_id}&active_only=true`;
        console.log('[Upload] Fetching from:', url);

        const response = await fetch(url);
        const data = await response.json();

        console.log('[Upload] Sessions response:', data);

        if (data.sessions && data.sessions.length > 0) {
          console.log('[Upload] Found sessions:', data.sessions.length);
          setSessions(data.sessions);
          setShowSessionBanner(true);
        } else {
          console.log('[Upload] No sessions found');
        }
      } catch (err) {
        console.error('[Upload] Error fetching sessions:', err);
      } finally {
        setSessionsLoading(false);
      }
    };

    fetchSessions();
  }, [user]);

  // Handle session selection
  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    setJobTitle(session.job_title);
    setJobDescription(session.job_description || '');
    setShowSessionBanner(false);
  };

  // Handle starting a new session
  const handleNewSession = () => {
    setSelectedSession(null);
    setJobTitle('');
    setJobDescription('');
    setShowSessionBanner(false);
  };

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

      console.log('[Submit] Starting submission...');
      console.log('[Submit] User:', user);
      console.log('[Submit] Selected session:', selectedSession);

      let sessionId = selectedSession?.id;
      let versionNumber = 1;

      // Create or update session
      if (selectedSession) {
        // Continuing existing session
        versionNumber = selectedSession.total_uploads + 1;
        console.log(`[Submit] Continuing session ${sessionId}, version ${versionNumber}`);

        // Update session
        await fetch(`/api/sessions/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            total_uploads: versionNumber,
            last_upload_at: new Date().toISOString()
          })
        });
      } else if (user?.user_id) {
        // Create new session
        console.log('[Submit] Creating new session for user:', user.user_id);
        const sessionPayload = {
          wp_user_id: user.user_id,
          job_title: jobTitle,
          job_description: jobDescription,
          company_name: '' // Could extract from job title/description
        };
        console.log('[Submit] Session payload:', sessionPayload);

        const sessionResponse = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionPayload)
        });

        const sessionData = await sessionResponse.json();
        console.log('[Submit] Session response:', sessionData);
        sessionId = sessionData.session?.id;
        console.log('[Submit] New session created:', sessionId);
      } else {
        console.log('[Submit] No user authenticated, skipping session creation');
      }

      // 1. Upload PDF to Supabase Storage
      console.log("Uploading file to Supabase Storage...");
      const filePath = `resumes/${user?.user_id || 'anon'}/${Date.now()}-${fileName}`;

      const { data: fileData, error: uploadError } = await supabase.storage
        .from('resume-files')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      console.log("File uploaded successfully:", filePath);

      // 2. Get public URL for the file
      const { data: urlData } = await supabase.storage
        .from('resume-files')
        .getPublicUrl(filePath);

      let fileUrl = urlData.publicUrl;
      if (!fileUrl.includes('/public/')) {
        fileUrl = fileUrl.replace('/storage/v1/object/', '/storage/v1/object/public/');
      }

      console.log("File public URL (fixed):", fileUrl);

      // 3. Store metadata in the database with session link
      console.log("Saving metadata to database...");
      const { data: resumeData, error: dbError} = await supabase
        .from('resumes')
        .insert({
          wp_user_id: user?.user_id || null,
          session_id: sessionId,
          version_number: versionNumber,
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
      console.log(`Session: ${sessionId}, Version: ${versionNumber}`);

      // 4. Store resume ID in localStorage for next step
      localStorage.setItem('currentResumeId', resumeData.id);
      if (sessionId) {
        localStorage.setItem('currentSessionId', sessionId);
      }

      // 5. Navigate to analyzing page
      router.push('/analyzing');

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

      {/* Auth Welcome Banner */}
      {contextLoaded && user && (
        <div className="w-full max-w-2xl bg-gradient-to-r from-teal-500/20 to-cyan-500/20 border-2 border-teal-500/50 rounded-lg p-4 relative animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Sparkles className="text-teal-400" size={24} />
            </div>
            <div className="text-left">
              <h3 className="text-white font-bold text-lg mb-1">
                ✨ Welcome, {user.name}!
              </h3>
              <p className="text-teal-100 text-sm">
                Membership Level: <span className="font-semibold">{user.membership_level}</span>
              </p>
              {user.email && (
                <p className="text-teal-200/70 text-xs mt-1">{user.email}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Session Banner - Continue Previous Analysis */}
      {showSessionBanner && sessions.length > 0 && (
        <SessionBanner
          sessions={sessions}
          selectedSession={selectedSession}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onClose={() => setShowSessionBanner(false)}
        />
      )}

      {/* Selected Session Info */}
      {selectedSession && (
        <div className="w-full max-w-2xl bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <p className="text-green-400 text-sm font-semibold">
            📝 Continuing: {selectedSession.session_name}
          </p>
          <p className="text-green-300/70 text-xs mt-1">
            This will be version {selectedSession.total_uploads + 1}
          </p>
        </div>
      )}

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
