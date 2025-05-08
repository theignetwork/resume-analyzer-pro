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
      console.log("Preparing request to Affinda API");
      
      // API request with correct parameters based on documentation
      const requestBody = {
        url: resume.file_url,
        wait: true,
        workspace: AFFINDA_WORKSPACE_ID,
        identifier: `resume-${resumeId}` // Not customIdentifier, just identifier
      };
      
      console.log("Calling Affinda API...");
      
      // Use the main documents endpoint, no extractor in the URL
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
      console.log("Resume parsing complete");
      
      // Extract text based on v3 response structure
      let resumeText = '';
      
      // Try to find the text in various locations in the response
      if (parsedData.data && typeof parsedData.data === 'object') {
        if (parsedData.data.rawText) {
          resumeText = parsedData.data.rawText;
          console.log("Found text in data.rawText");
        } else if (parsedData.data.content) {
          resumeText = parsedData.data.content;
          console.log("Found text in data.content");
        } else if (parsedData.data.text) {
          resumeText = parsedData.data.text;
          console.log("Found text in data.text");
        }
        
        // Check if there's a deeper data structure
        if (!resumeText && parsedData.data.data) {
          if (parsedData.data.data.rawText) {
            resumeText = parsedData.data.data.rawText;
            console.log("Found text in data.data.rawText");
          } else if (parsedData.data.data.content) {
            resumeText = parsedData.data.data.content;
            console.log("Found text in data.data.content");
          }
        }
      }
      
      // Check in the root
      if (!resumeText) {
        if (parsedData.rawText) {
          resumeText = parsedData.rawText;
          console.log("Found text in rawText");
        } else if (parsedData.content) {
          resumeText = parsedData.content;
          console.log("Found text in content");
        }
      }
      
      // Last resort
      if (!resumeText && parsedData.text) {
        resumeText = parsedData.text;
        console.log("Found text in text");
      }
      
      // If still no text found, try a fallback extraction method
      if (!resumeText || resumeText.trim().length === 0) {
        console.error("No text could be extracted from the resume");
        
        // Try direct text extraction
        try {
          console.log("Attempting text-only extraction as fallback...");
          
          const textExtractionResponse = await fetch('https://api.affinda.com/v3/documents/extract-text', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${AFFINDA_API_KEY}`
            },
            body: JSON.stringify({ url: resume.file_url })
          });
          
          if (textExtractionResponse.ok) {
            const textData = await textExtractionResponse.json();
            if (textData.text) {
              resumeText = textData.text;
              console.log("Successfully extracted text with fallback method");
            }
          }
        } catch (textError) {
          console.error("Text extraction fallback also failed:", textError);
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
          parser_version: 'v3-standard'
        })
        .eq('id', resumeId);
        
      if (updateError) {
        console.error("Error updating resume with parsed data:", updateError);
        throw updateError;
      }
      
      console.log("Resume updated with structured data and text");
      
      return NextResponse.json({
        success: true,
        message: "Resume parsed successfully"
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
