import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import pdfParse from 'pdf-parse';

export async function POST(request) {
  try {
    const { resumeId } = await request.json();
    
    if (!resumeId) {
      console.error("No resumeId provided in request");
      return NextResponse.json({ error: 'No resumeId provided' }, { status: 400 });
    }
    
    console.log("Extracting text from resume ID:", resumeId);
    
    // Fetch resume data
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
      // Fetch the PDF file
      console.log("Fetching PDF from URL:", resume.file_url);
      const response = await fetch(resume.file_url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      }
      
      // Get the PDF content as Buffer
      const pdfData = await response.arrayBuffer();
      
      // Extract text from PDF using pdf-parse
      console.log("Extracting text from PDF...");
      const data = await pdfParse(Buffer.from(pdfData));
      const extractedText = data.text;
      
      console.log("Text extraction complete. Length:", extractedText.length);
      console.log("Sample text:", extractedText.substring(0, 200));
      
      // Update the resume record with the extracted text
      const { error: updateError } = await supabase
        .from('resumes')
        .update({ resume_text: extractedText })
        .eq('id', resumeId);
        
      if (updateError) {
        console.error("Error updating resume with extracted text:", updateError);
        throw updateError;
      }
      
      console.log("Resume updated with extracted text");
      
      return NextResponse.json({
        success: true,
        textLength: extractedText.length
      });
      
    } catch (extractError) {
      console.error("Error extracting text:", extractError);
      return NextResponse.json({ error: 'Text extraction error: ' + extractError.message }, { status: 500 });
    }
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json({ error: 'API error: ' + error.message }, { status: 500 });
  }
}