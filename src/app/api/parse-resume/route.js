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
      
      // According to documentation:
      // - Just use workspace (without documentType) to let Affinda auto-classify
      // - Use "identifier" (not customIdentifier)
      const requestBody = {
        url: resume.file_url,
        wait: true,
        workspace: AFFINDA_WORKSPACE_ID,
        identifier: `resume-${resumeId}`
      };
      
      console.log("Request body:", JSON.stringify(requestBody));
      console.log("Calling Affinda API...");
      
      const affindaResponse = await fetch('https://api.affinda.com/v3/documents', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AFFINDA_API_KEY}`
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log("Affinda response status:", affindaResponse.status, affindaResponse.statusText);
      
      // Get the raw response for better debugging
      const responseText = await affindaResponse.text();
      console.log("Response received, length:", responseText.length);
      
      if (!affindaResponse.ok) {
        console.error("Affinda API error response status:", affindaResponse.status);
        try {
          // Try to parse error message for better reporting
          const errorData = JSON.parse(responseText);
          const errorMessage = errorData.message || errorData.detail || affindaResponse.statusText;
          console.error("Error details:", errorMessage);
          throw new Error(`Affinda API error: ${errorMessage}`);
        } catch (e) {
          throw new Error(`Affinda API error: ${affindaResponse.statusText}`);
        }
      }
      
      // Parse the response as JSON
      const parsedData = JSON.parse(responseText);
      console.log("Resume parsing complete, response contains keys:", Object.keys(parsedData));
      
      // Extract text using enhanced method
      let resumeText = extractTextFromResponse(parsedData);
      
      // If no text extracted, try text extraction API
      if (!resumeText || resumeText.trim().length === 0) {
        console.warn("No text extracted from main response, trying text extraction API...");
        
        try {
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
              console.log("Successfully extracted text with dedicated text extraction API");
            }
          } else {
            console.error("Text extraction API failed:", textExtractionResponse.status, textExtractionResponse.statusText);
          }
        } catch (textError) {
          console.error("Text extraction fallback also failed:", textError);
        }
      }
      
      // Still no text? Try to use meta.pdf to fetch the PDF and extract text 
      if (!resumeText || resumeText.trim().length === 0) {
        console.warn("Still no text extracted, checking for PDF URL...");
        
        // Check if the parsed data contains a PDF URL
        if (parsedData.meta && parsedData.meta.pdf) {
          try {
            console.log("Found PDF URL in response, trying to extract text directly from PDF...");
            resumeText = `Document text could not be automatically extracted. PDF available at: ${parsedData.meta.pdf}`;
          } catch (pdfError) {
            console.error("PDF extraction failed:", pdfError);
          }
        }
      }
      
      // Final check for text content
      if (!resumeText || resumeText.trim().length === 0) {
        resumeText = "Text extraction failed. This may be due to the document being an image-based PDF without embedded text.";
        console.warn("Using fallback text message since no text could be extracted");
      }
      
      console.log("Final extracted resume text length:", resumeText.length);
      
      // Check if we have a document type in the response
      let documentType = "unknown";
      if (parsedData.meta && parsedData.meta.documentType) {
        documentType = parsedData.meta.documentType;
        console.log("Document was classified as:", documentType);
      }
      
      // Update the resume record with the parsed data
      const { error: updateError } = await supabase
        .from('resumes')
        .update({ 
          resume_structured_data: parsedData,
          resume_text: resumeText,
          parser_version: `v3-${documentType}`
        })
        .eq('id', resumeId);
        
      if (updateError) {
        console.error("Error updating resume with parsed data:", updateError);
        throw updateError;
      }
      
      console.log("Resume updated with structured data and text");
      
      return NextResponse.json({
        success: true,
        message: "Resume parsed successfully",
        documentType: documentType
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

// Enhanced helper function to extract text from API response
function extractTextFromResponse(parsedData) {
  // Log the structure for debugging
  console.log("Extracting text, top-level keys:", Object.keys(parsedData));
  
  // Resume-specific structure (common for resume parser)
  if (parsedData.data) {
    console.log("Checking data object, keys:", Object.keys(parsedData.data));
    
    // Standard locations
    if (parsedData.data.rawText) {
      console.log("Found text in data.rawText");
      return parsedData.data.rawText;
    }
    
    if (parsedData.data.content) {
      console.log("Found text in data.content");
      return parsedData.data.content;
    }
    
    if (parsedData.data.text) {
      console.log("Found text in data.text");
      return parsedData.data.text;
    }
    
    // Check for resume-specific structure
    if (parsedData.data.resume) {
      console.log("Found resume object in data.resume");
      
      const resume = parsedData.data.resume;
      
      if (resume.rawText) {
        console.log("Found text in data.resume.rawText");
        return resume.rawText;
      }
      
      // Sometimes text is in separate sections
      let combinedText = '';
      
      // Try to extract from normal text fields
      if (resume.textAnnotation && resume.textAnnotation.parsed) {
        combinedText += resume.textAnnotation.parsed + '\n\n';
      }
      
      // Look for sections
      if (resume.sections && Array.isArray(resume.sections)) {
        console.log("Found sections array in resume data");
        combinedText += resume.sections
          .filter(section => section.text)
          .map(section => section.text)
          .join('\n\n');
      }
      
      if (combinedText.trim()) {
        console.log("Extracted text from resume sections");
        return combinedText;
      }
    }
    
    // Nested data structure
    if (parsedData.data.data) {
      console.log("Checking deeper data.data object");
      
      const dataObj = parsedData.data.data;
      
      if (dataObj.rawText) {
        console.log("Found text in data.data.rawText");
        return dataObj.rawText;
      }
      
      if (dataObj.content) {
        console.log("Found text in data.data.content");
        return dataObj.content;
      }
      
      if (dataObj.text) {
        console.log("Found text in data.data.text");
        return dataObj.text;
      }
    }
  }
  
  // Check root properties
  if (parsedData.rawText) {
    console.log("Found text in rawText");
    return parsedData.rawText;
  }
  
  if (parsedData.content) {
    console.log("Found text in content");
    return parsedData.content;
  }
  
  if (parsedData.text) {
    console.log("Found text in text");
    return parsedData.text;
  }
  
  // Deep search as a last resort
  console.log("No standard text fields found, performing deep search");
  return deepSearchForText(parsedData);
}

// Helper function to search deeply for text in any property
function deepSearchForText(obj, depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return ''; // Prevent infinite recursion
  
  // Handle null or undefined
  if (!obj) return '';
  
  // If it's a string with reasonable length, it might be our text
  if (typeof obj === 'string' && obj.length > 100) {
    return obj;
  }
  
  // If it's an array, search each element
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const text = deepSearchForText(item, depth + 1, maxDepth);
      if (text) return text;
    }
    return '';
  }
  
  // If it's an object, search each property
  if (typeof obj === 'object') {
    // First check properties that are likely to contain text
    const likelyTextProps = ['rawText', 'text', 'content', 'fullText', 'body', 'description'];
    for (const prop of likelyTextProps) {
      if (obj[prop] && typeof obj[prop] === 'string' && obj[prop].length > 100) {
        console.log(`Found text in deep search: ${prop}`);
        return obj[prop];
      }
    }
    
    // Then check all properties
    for (const key in obj) {
      const text = deepSearchForText(obj[key], depth + 1, maxDepth);
      if (text) return text;
    }
  }
  
  return '';
}
