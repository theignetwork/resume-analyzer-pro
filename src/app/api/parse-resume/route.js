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
      
      // Based on the documentation, the correct parameters for v3 API
      const requestBody = {
        url: resume.file_url,
        wait: true,
        workspace: AFFINDA_WORKSPACE_ID,
        documentType: "resume", // Explicitly setting document type to resume
        customIdentifier: `resume-${resumeId}`
      };
      
      console.log("Calling Affinda API v3...");
      
      // Use the v3 documents endpoint without extractor parameter in URL
      const affindaResponse = await fetch('https://api.affinda.com/v3/documents', {
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
      
      // Extract text based on v3 response structure
      let resumeText = '';
      
      // The documentation suggests data is the main response field
      if (parsedData.data) {
        console.log("Data field found, keys:", Object.keys(parsedData.data));
        
        // Specific places where text might be found in the response
        if (parsedData.data.content) {
          resumeText = parsedData.data.content;
          console.log("Found text in data.content");
        } else if (parsedData.data.rawText) {
          resumeText = parsedData.data.rawText;
          console.log("Found text in data.rawText");
        } else if (parsedData.data.text) {
          resumeText = parsedData.data.text;
          console.log("Found text in data.text");
        } else if (parsedData.data.textContent) {
          resumeText = parsedData.data.textContent;
          console.log("Found text in data.textContent");
        }
        
        // Resume data might be in a more structured format in data.data
        if (!resumeText && parsedData.data.data) {
          console.log("Looking in data.data, keys:", Object.keys(parsedData.data.data));
          
          if (parsedData.data.data.rawText) {
            resumeText = parsedData.data.data.rawText;
            console.log("Found text in data.data.rawText");
          } else if (parsedData.data.data.content) {
            resumeText = parsedData.data.data.content;
            console.log("Found text in data.data.content");
          }
        }
      }
      
      // Check if the text is in the top level of the response
      if (!resumeText) {
        if (parsedData.rawText) {
          resumeText = parsedData.rawText;
          console.log("Found text in rawText");
        } else if (parsedData.content) {
          resumeText = parsedData.content;
          console.log("Found text in content");
        }
      }
      
      // As a last resort, try to extract text from the PDF
      if (!resumeText && parsedData.pdf) {
        console.log("No text found in structured data, but PDF URL is available:", parsedData.pdf);
        resumeText = "PDF content available but text extraction failed";
      }
      
      if (!resumeText || resumeText.trim().length === 0) {
        console.error("No text could be extracted from the resume");
        return NextResponse.json({ 
          error: 'No text could be extracted from the resume. Please ensure the PDF contains selectable text.',
          parsed_data: parsedData // Include the parsed data for debugging
        }, { status: 400 });
      }
      
      console.log("Extracted resume text length:", resumeText.length);
      console.log("First 100 chars of text:", resumeText.substring(0, 100));
      
      // Update the resume record with the parsed data
      const { error: updateError } = await supabase
        .from('resumes')
        .update({ 
          resume_structured_data: parsedData,
          resume_text: resumeText,
          parser_version: 'v3-documentType' // Track that we're using documentType approach
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
