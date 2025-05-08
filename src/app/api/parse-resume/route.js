import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Affinda API key and workspace ID from environment variables
const AFFINDA_API_KEY = process.env.AFFINDA_API_KEY;
const AFFINDA_WORKSPACE_ID = process.env.AFFINDA_WORKSPACE_ID;

export async function POST(request) {
  try {
    // Check if API key is configured
    if (!AFFINDA_API_KEY) {
      console.error("Affinda API key not configured");
      return NextResponse.json({ 
        error: 'Server configuration error: API key not set' 
      }, { status: 500 });
    }
    
    // Check if workspace ID is configured
    if (!AFFINDA_WORKSPACE_ID) {
      console.error("Affinda workspace ID not configured");
      return NextResponse.json({ 
        error: 'Server configuration error: workspace ID not set' 
      }, { status: 500 });
    }
    
    const { resumeId } = await request.json();
    
    if (!resumeId) {
      console.error("No resumeId provided in request");
      return NextResponse.json({ error: 'No resumeId provided' }, { status: 400 });
    }
    
    console.log("Parsing resume ID:", resumeId);
    
    // Fetch resume data from Supabase
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single();
      
    if (resumeError) {
      console.error("Error fetching resume:", resumeError);
      return NextResponse.json({ error: 'Resume not found: ' + resumeError.message }, { status: 404 });
    }
    
    if (!resume.file_url) {
      console.error("Resume has no file_url");
      return NextResponse.json({ error: 'Resume has no file_url' }, { status: 400 });
    }
    
    try {
      console.log("Preparing request to Affinda v3 API...");
      
      // IMPORTANT: In v3, we'll try a different approach by using the resumeParser endpoint
      // rather than the generic documents endpoint with an extractor parameter
      const requestBody = {
        url: resume.file_url,
        wait: true,
        workspaceId: AFFINDA_WORKSPACE_ID, // Note: different parameter name for this endpoint!
        expiry: "2030-01-01" // Set a far future expiry date
      };
      
      console.log("Calling Affinda Resume Parser API v3...");
      
      // CRITICAL CHANGE: Use the dedicated resume parser endpoint
      const affindaResponse = await fetch('https://api.affinda.com/v3/resumes', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AFFINDA_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log("Affinda response status:", affindaResponse.status);
      console.log("Affinda response status text:", affindaResponse.statusText);
      
      // Get the raw response for better debugging
      const responseText = await affindaResponse.text();
      console.log("Response received, length:", responseText.length);
      
      if (!affindaResponse.ok) {
        console.error("Affinda API error response status:", affindaResponse.status);
        
        try {
          // Try to parse error message for better reporting
          const errorData = JSON.parse(responseText);
          throw new Error(`Affinda API error: ${errorData.message || errorData.detail || affindaResponse.statusText}`);
        } catch (e) {
          throw new Error(`Affinda API error: ${affindaResponse.statusText}`);
        }
      }
      
      // Parse the response as JSON
      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
        console.log("Resume parsing complete, response structure:", Object.keys(parsedData));
      } catch (jsonError) {
        console.error("Error parsing JSON response:", jsonError);
        throw new Error("Failed to parse API response as JSON");
      }
      
      // Extract the text based on v3 resume parser response structure
      let resumeText = '';
      
      if (parsedData.data && typeof parsedData.data.raw === 'string') {
        // v3 resume parser specific path
        resumeText = parsedData.data.raw;
        console.log("Found text in parsedData.data.raw");
      } else if (parsedData.data && parsedData.data.rawText) {
        resumeText = parsedData.data.rawText;
        console.log("Found text in parsedData.data.rawText");
      } else if (parsedData.rawText) {
        resumeText = parsedData.rawText;
        console.log("Found text in parsedData.rawText");
      } else if (parsedData.data && parsedData.data.data && parsedData.data.data.rawText) {
        resumeText = parsedData.data.data.rawText;
        console.log("Found text in parsedData.data.data.rawText");
      }
      
      // Additional fallback methods if needed
      if (!resumeText && parsedData.data && parsedData.data.textAnnotation) {
        resumeText = parsedData.data.textAnnotation;
        console.log("Found text in textAnnotation");
      }
      
      if (!resumeText || resumeText.trim().length === 0) {
        console.error("No text could be extracted from the resume");
        
        // Check if we have extracted sections even without raw text
        let sections = [];
        if (parsedData.data && Array.isArray(parsedData.data.sections)) {
          sections = parsedData.data.sections;
        } else if (parsedData.data && parsedData.data.data && Array.isArray(parsedData.data.data.sections)) {
          sections = parsedData.data.data.sections;
        }
        
        if (sections.length > 0) {
          // Try to reconstruct text from sections
          console.log("Attempting to reconstruct text from sections");
          resumeText = sections.map(section => section.text || '').join('\n\n');
        }
        
        if (!resumeText || resumeText.trim().length === 0) {
          return NextResponse.json({ 
            error: 'No text could be extracted from the resume. Please ensure the PDF contains selectable text.'
          }, { status: 400 });
        }
      }
      
      console.log("Extracted resume text length:", resumeText.length);
      
      // Update the resume record with the parsed data
      const { error: updateError } = await supabase
        .from('resumes')
        .update({ 
          resume_structured_data: parsedData,
          resume_text: resumeText,
          parser_version: 'v3-nextgen'
        })
        .eq('id', resumeId);
        
      if (updateError) {
        console.error("Error updating resume with parsed data:", updateError);
        throw updateError;
      }
      
      console.log("Resume updated with structured data and text");
      
      return NextResponse.json({
        success: true,
        message: "Resume parsed successfully with NextGen parser"
      });
      
    } catch (parseError) {
      console.error("Error parsing resume:", parseError);
      return NextResponse.json({ 
        error: 'Resume parsing error: ' + parseError.message 
      }, { status: 500 });
    }
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json({ 
      error: 'API error: ' + error.message 
    }, { status: 500 });
  }
}
