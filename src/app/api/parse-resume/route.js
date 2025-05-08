import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Affinda API key from environment variable
const AFFINDA_API_KEY = process.env.AFFINDA_API_KEY || "aff_f7ade2a0ea61ae806f457d32031bef36d469892a";

export async function POST(request) {
  try {
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
      // Using the most basic v2 approach which has simpler requirements
      console.log("Preparing simplified request to Affinda v2 API...");
      
      // Keep the request as simple as possible with just the essential fields
      const requestBody = {
        url: resume.file_url,
        wait: true
      };
      
      console.log("Calling Affinda API with request:", JSON.stringify(requestBody));
      
      // Use the v2 resumes endpoint which has simpler parameter requirements
      const affindaResponse = await fetch('https://api.affinda.com/v2/resumes', {
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
      console.log("Response text (first 200 chars):", responseText.substring(0, 200));
      
      if (!affindaResponse.ok) {
        console.error("Affinda API error response:", responseText);
        throw new Error(`Affinda API error: ${affindaResponse.statusText} - ${responseText}`);
      }
      
      // Parse the response as JSON
      const parsedData = JSON.parse(responseText);
      console.log("Resume parsing complete, response ID:", parsedData.identifier || parsedData.id);
      
      // Extract the structured data and text (handling different possible response formats)
      let resumeText = '';
      
      if (parsedData.data && parsedData.data.content) {
        resumeText = parsedData.data.content;
      } else if (parsedData.content) {
        resumeText = parsedData.content;
      } else if (parsedData.data && parsedData.data.rawText) {
        resumeText = parsedData.data.rawText;
      } else if (parsedData.rawText) {
        resumeText = parsedData.rawText;
      } else {
        console.log("Searching deeper in response structure for text...");
        // Try to find text in a nested structure if it exists
        const jsonStr = JSON.stringify(parsedData);
        const textMatch = jsonStr.match(/"(rawText|content)":"([^"]+)"/);
        if (textMatch && textMatch[2]) {
          resumeText = textMatch[2];
        }
      }
      
      if (!resumeText || resumeText.trim().length === 0) {
        console.error("No text could be extracted from the resume");
        return NextResponse.json({ 
          error: 'No text could be extracted from the resume. Please ensure the PDF contains selectable text.',
          data: parsedData
        }, { status: 400 });
      }
      
      console.log("Extracted resume text length:", resumeText.length);
      
      // Update the resume record with the parsed data
      const { error: updateError } = await supabase
        .from('resumes')
        .update({ 
          resume_structured_data: parsedData,
          resume_text: resumeText
        })
        .eq('id', resumeId);
        
      if (updateError) {
        console.error("Error updating resume with parsed data:", updateError);
        throw updateError;
      }
      
      console.log("Resume updated with structured data and text");
      
      return NextResponse.json({
        success: true,
        structuredData: parsedData
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