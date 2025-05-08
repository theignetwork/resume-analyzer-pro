import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Affinda API key from environment variable
const AFFINDA_API_KEY = process.env.AFFINDA_API_KEY;
const AFFINDA_WORKSPACE_ID = process.env.AFFINDA_WORKSPACE_ID;

export async function POST(request) {
  try {
    // Debug log environment variables (obscured for security)
    console.log("API Key defined:", !!AFFINDA_API_KEY);
    console.log("API Key prefix:", AFFINDA_API_KEY?.substring(0, 6));
    console.log("Workspace ID defined:", !!AFFINDA_WORKSPACE_ID);
    console.log("Workspace ID:", AFFINDA_WORKSPACE_ID);
    
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
    
    console.log("Resume file_url:", resume.file_url);
    
    try {
      // Let's try to first verify the workspace exists
      console.log("Verifying workspace...");
      const workspaceResponse = await fetch(`https://api.affinda.com/v3/workspaces/${AFFINDA_WORKSPACE_ID}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${AFFINDA_API_KEY}`
        }
      });
      
      console.log("Workspace verification status:", workspaceResponse.status);
      
      if (!workspaceResponse.ok) {
        const workspaceErrorText = await workspaceResponse.text();
        console.error("Workspace verification error:", workspaceErrorText);
        console.error("This suggests the workspace ID is invalid or the API key doesn't have access to it");
      } else {
        const workspace = await workspaceResponse.json();
        console.log("Workspace verified:", workspace.name);
      }
      
      // API v3 request with minimal required parameters
      const requestBody = {
        url: resume.file_url,
        wait: true,
        identifier: `resume-${resumeId}`,
        workspace: AFFINDA_WORKSPACE_ID
      };
      
      console.log("Calling Affinda API v3...");
      console.log("Request body:", JSON.stringify(requestBody));
      
      // Try without the extractor parameter first
      const apiUrl = 'https://api.affinda.com/v3/documents';
      console.log("API URL:", apiUrl);
      
      const affindaResponse = await fetch(apiUrl, {
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
      console.log("Raw response text:", responseText.substring(0, 1000)); // Log first 1000 chars
      
      if (!affindaResponse.ok) {
        console.error("Affinda API error response status:", affindaResponse.status);
        
        try {
          // Try to parse error message for better reporting
          const errorData = JSON.parse(responseText);
          console.error("Parsed error data:", JSON.stringify(errorData, null, 2));
          throw new Error(`Affinda API error: ${errorData.message || errorData.detail || affindaResponse.statusText}`);
        } catch (parseError) {
          console.error("Error parsing error response:", parseError);
          throw new Error(`Affinda API error: ${affindaResponse.statusText}, Raw response: ${responseText.substring(0, 200)}`);
        }
      }
      
      // Parse the response as JSON
      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
        console.log("Parsed data structure:", Object.keys(parsedData));
        console.log("Resume parsing complete, response ID:", parsedData.identifier || parsedData.id);
      } catch (jsonError) {
        console.error("Error parsing JSON response:", jsonError);
        return NextResponse.json({ error: 'Error parsing API response' }, { status: 500 });
      }
      
      // Extract the structured data and text (handling different possible response formats)
      // Note: v3 API has a different response structure
      let resumeText = '';
      
      // Check various locations where the text might be found
      console.log("Looking for resume text in response...");
      
      // v3 API typically has the resume text in one of these locations
      if (parsedData.data && parsedData.data.rawText) {
        resumeText = parsedData.data.rawText;
        console.log("Text found in parsedData.data.rawText");
      } else if (parsedData.data && parsedData.data.data && parsedData.data.data.rawText) {
        resumeText = parsedData.data.data.rawText;
        console.log("Text found in parsedData.data.data.rawText");
      } else if (parsedData.rawText) {
        resumeText = parsedData.rawText;
        console.log("Text found in parsedData.rawText");
      } else {
        console.log("Text not found in standard locations, searching deeper...");
        // Try to find text in a nested structure if it exists
        const jsonStr = JSON.stringify(parsedData);
        const textMatch = jsonStr.match(/"rawText":"([^"]+)"/);
        if (textMatch && textMatch[1]) {
          resumeText = textMatch[1];
          console.log("Text found using regex");
        }
      }
      
      if (!resumeText || resumeText.trim().length === 0) {
        console.error("No text could be extracted from the resume");
        return NextResponse.json({ 
          error: 'No text could be extracted from the resume. Please ensure the PDF contains selectable text.',
          parsed_data: parsedData // Include the parsed data for debugging
        }, { status: 400 });
      }
      
      console.log("Extracted resume text length:", resumeText.length);
      console.log("First 200 chars of text:", resumeText.substring(0, 200));
      
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
