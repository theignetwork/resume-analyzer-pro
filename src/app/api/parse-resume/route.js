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
      console.log("Preparing request to Affinda v3 API with workspace ID:", AFFINDA_WORKSPACE_ID);
      
      // API v3 request with minimal required parameters
      const requestBody = {
        url: resume.file_url,
        wait: true,
        identifier: `resume-${resumeId}`,
        workspace: AFFINDA_WORKSPACE_ID // Use the workspace ID from env var
      };
      
      console.log("Calling Affinda API v3...");
      
      // Use the v3 documents endpoint with the resume extractor
      const affindaResponse = await fetch('https://api.affinda.com/v3/documents?extractor=resume', {
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
      const parsedData = JSON.parse(responseText);
      console.log("Resume parsing complete, response ID:", parsedData.identifier || parsedData.id);
      
      // Extract the structured data and text (handling different possible response formats)
      // Note: v3 API has a different response structure
      let resumeText = '';
      
      // v3 API typically has the resume text in one of these locations
      if (parsedData.data && parsedData.data.rawText) {
        resumeText = parsedData.data.rawText;
      } else if (parsedData.data && parsedData.data.data && parsedData.data.data.rawText) {
        resumeText = parsedData.data.data.rawText;
      } else if (parsedData.rawText) {
        resumeText = parsedData.rawText;
      } else {
        console.log("Searching deeper in response structure for text...");
        // Try to find text in a nested structure if it exists
        const jsonStr = JSON.stringify(parsedData);
        const textMatch = jsonStr.match(/"rawText":"([^"]+)"/);
        if (textMatch && textMatch[1]) {
          resumeText = textMatch[1];
        }
      }
      
      if (!resumeText || resumeText.trim().length === 0) {
        console.error("No text could be extracted from the resume");
        return NextResponse.json({ 
          error: 'No text could be extracted from the resume. Please ensure the PDF contains selectable text.'
        }, { status: 400 });
      }
      
      console.log("Extracted resume text length:", resumeText.length);
      
      // Update the resume record with the parsed data
      const { error: updateError } = await supabase
        .from('resumes')
        .update({ 
          resume_structured_data: parsedData,
          resume_text: resumeText,
          parser_version: 'v3-nextgen' // Add this to track which parser version was used
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