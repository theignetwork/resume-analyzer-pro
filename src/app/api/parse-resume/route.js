import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const AFFINDA_API_KEY = process.env.AFFINDA_API_KEY;
const AFFINDA_WORKSPACE_ID = process.env.AFFINDA_WORKSPACE_ID;

export async function POST(request) {
  try {
    if (!AFFINDA_API_KEY || !AFFINDA_WORKSPACE_ID) {
      console.error("Affinda configuration error");
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { resumeId } = await request.json();
    if (!resumeId) return NextResponse.json({ error: 'No resumeId provided' }, { status: 400 });

    const { data: resume, error: resumeError } = await supabase.from('resumes').select('*').eq('id', resumeId).single();
    if (resumeError || !resume?.file_url) {
      return NextResponse.json({ error: resumeError?.message || 'Resume has no file_url' }, { status: 404 });
    }

    const requestBody = {
      url: resume.file_url,
      wait: true,
      workspace: AFFINDA_WORKSPACE_ID,
      documentType: "oprLlBoq",
      identifier: `resume-${resumeId}`
    };

    const affindaResponse = await fetch('https://api.affinda.com/v3/documents', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AFFINDA_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await affindaResponse.text();
    if (!affindaResponse.ok) {
      const errorMessage = (() => {
        try {
          const data = JSON.parse(responseText);
          return data.message || data.detail || affindaResponse.statusText;
        } catch (_) {
          return affindaResponse.statusText;
        }
      })();
      return NextResponse.json({ error: `Affinda API error: ${errorMessage}` }, { status: affindaResponse.status });
    }

    const parsedData = JSON.parse(responseText);
    let resumeText = extractTextFromResponse(parsedData);

    if (!resumeText?.trim()) {
      const fallback = await fetch('https://api.affinda.com/v3/documents/extract-text', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AFFINDA_API_KEY}`
        },
        body: JSON.stringify({ url: resume.file_url })
      });
      if (fallback.ok) {
        const { text } = await fallback.json();
        resumeText = text || resumeText;
      }
    }

    if (!resumeText?.trim() && parsedData.meta?.pdf) {
      resumeText = `Document text could not be automatically extracted. PDF available at: ${parsedData.meta.pdf}`;
    }
    if (!resumeText?.trim()) {
      resumeText = "Text extraction failed. This may be due to the document being an image-based PDF without embedded text.";
    }

    // Transform Affinda data into our expected format
    const transformedData = transformAffindaResponse(parsedData);
    
    // Debug logging to help troubleshoot
    console.log("Raw Affinda skills:", parsedData?.data?.skills);
    console.log("Transformed skills data:", transformedData.skills);
    console.log("Skills count:", transformedData.skills?.length || 0);

    const documentType = parsedData.meta?.documentType || 'unknown';
    const { error: updateError } = await supabase.from('resumes').update({
      resume_structured_data: transformedData, // Using transformed data instead of raw
      resume_text: resumeText,
      parser_version: `v3-${documentType}`
    }).eq('id', resumeId);

    if (updateError) throw updateError;

    return NextResponse.json({ 
      success: true, 
      message: 'Resume parsed successfully', 
      documentType,
      skillsFound: transformedData.skills?.length || 0
    });
  } catch (error) {
    console.error("Parse resume error:", error);
    return NextResponse.json({ error: 'API error: ' + error.message }, { status: 500 });
  }
}

// Transform Affinda response into our expected frontend format
function transformAffindaResponse(affindaData) {
  const data = affindaData?.data || {};
  
  return {
    // Personal Information
    personalInfo: {
      name: data.name?.raw || '',
      email: data.emails?.[0]?.raw || '',
      phone: data.phoneNumbers?.[0]?.raw || '',
      location: data.location?.raw || ''
    },
    
    // Summary/Objective
    summary: data.objective || data.summary || '',
    
    // Work Experience
    workExperience: data.workExperience?.map(exp => ({
      jobTitle: exp.jobTitle || '',
      organization: exp.organization || '',
      startDate: exp.dates?.startDate || '',
      endDate: exp.dates?.endDate || '',
      description: exp.jobDescription || ''
    })) || [],
    
    // Education
    education: data.education?.map(edu => ({
      institution: edu.organization || '',
      degree: edu.accreditation?.education || '',
      field: edu.accreditation?.educationLevel || '',
      startDate: edu.dates?.startDate || '',
      endDate: edu.dates?.endDate || ''
    })) || [],
    
    // Skills - THE KEY FIX FOR THE SKILLS DETECTION ISSUE
    skills: data.skills?.map(skill => {
      // Handle both string and object formats from Affinda
      if (typeof skill === 'string') {
        return {
          name: skill,
          level: null,
          confidence: 0.8
        };
      } else if (typeof skill === 'object') {
        return {
          name: skill.name || skill.skill || skill,
          level: skill.level || null,
          confidence: skill.confidence || 0.8
        };
      }
      return null;
    }).filter(Boolean) || [],
    
    // Certifications
    certifications: data.certifications?.map(cert => ({
      name: cert.name || '',
      issuer: cert.issuer || '',
      date: cert.date || ''
    })) || [],
    
    // Languages
    languages: data.languages?.map(lang => ({
      name: lang.name || lang,
      proficiency: lang.proficiency || ''
    })) || [],
    
    // Projects (if available)
    projects: data.projects?.map(project => ({
      name: project.name || '',
      description: project.description || '',
      technologies: project.technologies || []
    })) || [],
    
    // Keep raw Affinda data for debugging and future use
    _rawAffindaData: affindaData
  };
}

function extractTextFromResponse(data) {
  const searchPaths = [
    'data.rawText', 'data.content', 'data.text',
    'data.resume.rawText', 'data.resume.textAnnotation.parsed',
    'rawText', 'content', 'text'
  ];

  for (const path of searchPaths) {
    const parts = path.split('.');
    let val = data;
    for (const part of parts) val = val?.[part];
    if (typeof val === 'string' && val.length > 100) return val;
  }

  if (Array.isArray(data?.data?.resume?.sections)) {
    const text = data.data.resume.sections.map(s => s.text).filter(Boolean).join('\n\n');
    if (text.length > 100) return text;
  }

  return deepSearchForText(data);
}

function deepSearchForText(obj, depth = 0, maxDepth = 5) {
  if (depth > maxDepth || !obj) return '';
  if (typeof obj === 'string' && obj.length > 100) return obj;
  if (Array.isArray(obj)) return obj.map(o => deepSearchForText(o, depth + 1)).find(Boolean) || '';
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const val = deepSearchForText(obj[key], depth + 1);
      if (val) return val;
    }
  }
  return '';
}
