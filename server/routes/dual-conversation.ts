
import type { Request, Response } from "express";
import { db } from "@db";
import { chatConfigs, dualConversations } from "@db/schema";
import { eq, and } from "drizzle-orm";
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';

// Custom multer error handler
export const multerErrorHandler = (error: any, req: Request, res: Response, next: Function) => {
  if (error) {
    console.error("Multer error:", error);
    return res.status(400).json({ 
      error: "File upload error",
      message: error.message || "Failed to upload audio file"
    });
  }
  next();
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: false
});

// Set up file storage for audio uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Set upload size limit to 50MB and add better error handling
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB file size limit
  fileFilter: (req, file, cb) => {
    console.log("Upload attempted with file:", file.originalname, "size:", file.size, "type:", file.mimetype);
    
    // Accept all audio file types
    if (file.mimetype.startsWith('audio/')) {
      console.log("Audio file accepted");
      cb(null, true);
    } else {
      console.log("File rejected: not an audio file");
      cb(new Error('Only audio files are allowed!'));
    }
  }
});

export const saveAudio = upload.single('audio');

export async function handleSaveAudio(req: Request, res: Response) {
  try {
    console.log("handleSaveAudio called with request:", {
      body: req.body,
      file: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        filename: req.file.filename
      } : null
    });
    
    // Multer errors are handled by the error handler middleware
    
    if (!req.file) {
      console.error("No file in request");
      return res.status(400).json({ 
        error: "No audio file provided",
        message: "Please make sure you're recording and uploading an audio file."
      });
    }

    // Validate file size - additional check beyond multer limits
    if (req.file.size > 50 * 1024 * 1024) { // 50MB
      console.error("File too large:", req.file.size);
      return res.status(400).json({
        error: "File too large",
        message: "Audio file exceeds the 50MB size limit."
      });
    }

    const { configId, sessionId, participant1Name, participant2Name } = req.body;

    // Log the received parameters
    console.log("Received parameters:", { configId, sessionId, participant1Name, participant2Name });

    if (!configId || !sessionId) {
      console.error("Missing required parameters:", { configId, sessionId });
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const audioUrl = `/uploads/${req.file.filename}`;
    console.log("Audio saved successfully at:", audioUrl);

    // Skip database saving since the table doesn't exist
    // Just return the audio URL for processing
    res.json({
      success: true,
      audioUrl,
      participant1Name,
      participant2Name
    });
  } catch (error: any) {
    console.error("Error handling audio:", error);
    // Provide more descriptive error message to client
    res.status(500).json({ 
      error: "Failed to save audio file",
      message: error.message,
      details: error.toString()
    });
  }
}

export async function transcribeAudio(req: Request, res: Response) {
  try {
    const configId = parseInt(req.query.configId as string);
    const sessionId = req.query.sessionId as string;
    const participant1Name = req.query.participant1Name as string || 'Person 1';
    const participant2Name = req.query.participant2Name as string || 'Person 2';
    const audioUrl = req.body.audioUrl || req.query.audioUrl;

    if (isNaN(configId) || !sessionId) {
      return res.status(400).json({ error: "Valid config ID and session ID are required" });
    }

    if (!audioUrl) {
      return res.status(400).json({ error: "Audio URL is required" });
    }

    const audioFilePath = path.join(process.cwd(), audioUrl.replace(/^\//, ''));
    
    if (!fs.existsSync(audioFilePath)) {
      return res.status(404).json({ error: "Audio file not found on disk" });
    }

    try {
      console.log(`Transcribing audio file: ${audioFilePath}`);
      
      // Create a readable stream from the file
      const audioFile = fs.createReadStream(audioFilePath);
      
      // Call OpenAI API to transcribe the audio
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"]
      });
      
      console.log("Transcription successful");
      
      // Process the segments to assign speakers
      const segments = transcription.segments || [];
      
      // Simple algorithm to alternate speakers
      // For a production app, you would want to use a more sophisticated speaker diarization
      // but this is a simplified approach for the POC
      let currentSpeaker = "participant1";
      const transcript = segments.map((segment, index) => {
        // Toggle speaker for every segment
        // In a real app, you'd use more sophisticated speaker recognition
        if (index > 0) {
          currentSpeaker = currentSpeaker === "participant1" ? "participant2" : "participant1";
        }
        
        return {
          role: currentSpeaker,
          content: segment.text.trim(),
          timestamp: segment.start
        };
      });
      
      // Return the processed transcript
      res.json({
        success: true,
        transcript,
        participant1Name,
        participant2Name
      });
      
    } catch (openaiError: any) {
      console.error("OpenAI API Error:", openaiError);
      
      // Check for quota exceeded error
      const isQuotaError = openaiError.message && openaiError.message.includes("quota");
      const errorMessage = isQuotaError 
        ? "OpenAI API quota exceeded. Please check your billing details on your OpenAI account."
        : openaiError.message || 'Unknown error';
      
      // If we have API issues, fall back to the mock data but provide specific information about the error
      const mockTranscript = [
        { 
          role: "participant1", 
          content: "Hello, how are you doing today?", 
          timestamp: 0 
        },
        { 
          role: "participant2", 
          content: "I'm doing well, thank you for asking. How about yourself?", 
          timestamp: 3 
        },
        { 
          role: "participant1", 
          content: "I'm good too. I wanted to discuss the project timeline with you.", 
          timestamp: 7 
        },
        { 
          role: "participant2", 
          content: "Sure, what specifically about the timeline would you like to discuss?", 
          timestamp: 12 
        }
      ];
      
      res.json({
        success: true,
        transcript: mockTranscript,
        participant1Name,
        participant2Name,
        note: `Using sample data due to API error: ${errorMessage}. ${isQuotaError ? 'Your API key is valid but has reached its usage limit.' : 'Please check your OpenAI API key configuration.'}`
      });
    }
  } catch (error: any) {
    console.error("Error transcribing audio:", error);
    res.status(500).json({ error: "Failed to transcribe audio", message: error.message });
  }
}

export async function generateFeedback(req: Request, res: Response) {
  try {
    const configId = parseInt(req.query.configId as string);
    const sessionId = req.query.sessionId as string;
    const transcript = req.body.transcript || [];
    const participant1Name = req.body.participant1Name || req.query.participant1Name as string || 'Person 1';
    const participant2Name = req.body.participant2Name || req.query.participant2Name as string || 'Person 2';

    if (isNaN(configId) || !sessionId) {
      return res.status(400).json({ error: "Valid config ID and session ID are required" });
    }

    if (!transcript || transcript.length === 0) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    try {
      // Get the config with feedback criteria
      const config = await db.query.chatConfigs.findFirst({
        where: eq(chatConfigs.id, configId)
      });

      if (!config) {
        return res.status(400).json({ error: "Configuration not found" });
      }
      
      // Use default feedback criteria if none is provided
      const feedbackCriteria = config.feedbackCriteria || 
        "Evaluate the conversation for clarity, engagement, and effective communication. Consider turn-taking, active listening, and how well each participant expresses their ideas.";
      
      console.log("Generating feedback using OpenAI API");
      
      // Format the conversation for GPT analysis
      const conversationText = transcript.map((entry: { role: string; content: string }) => {
        const speaker = entry.role === 'participant1' ? participant1Name : participant2Name;
        return `${speaker}: ${entry.content}`;
      }).join('\n');
      
      // Prepare the system prompt with instructions
      const systemPrompt = `
You are an expert in analyzing conversations between two people. You'll be evaluating a conversation between ${participant1Name} and ${participant2Name}.

${feedbackCriteria}

After analyzing the conversation, provide constructive feedback in this exact JSON structure:
{
  "participant1": {
    "bullets": [array of 3-5 specific feedback points for ${participant1Name}],
    "score": [numerical score from 1-10],
    "summary": [1-2 sentence overall feedback]
  },
  "participant2": {
    "bullets": [array of 3-5 specific feedback points for ${participant2Name}],
    "score": [numerical score from 1-10],
    "summary": [1-2 sentence overall feedback]
  },
  "overall": {
    "bullets": [array of 3-5 points about the conversation as a whole],
    "summary": [1-2 sentence summary of the overall interaction]
  }
}

Make sure your feedback is specific, actionable, and balanced between strengths and areas for improvement.
`;

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-16k",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: conversationText }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      });
      
      const responseContent = completion.choices[0].message.content;
      console.log("OpenAI API response received successfully");
      
      if (!responseContent) {
        throw new Error("Empty response from OpenAI API");
      }
      
      // Parse the JSON response
      const feedbackData = JSON.parse(responseContent);
      
      // No database storage needed - just return the feedback
      res.json(feedbackData);
      
    } catch (openaiError: any) {
      console.error("OpenAI API Error:", openaiError);
      
      // Check for quota exceeded error
      const isQuotaError = openaiError.message && openaiError.message.includes("quota");
      const errorMessage = isQuotaError 
        ? "OpenAI API quota exceeded. Please check your billing details on your OpenAI account."
        : openaiError.message || 'Unknown error';
      
      // If we still have API issues, fall back to the mock data
      const mockFeedback = {
        "participant1": {
          "bullets": [
            "You initiated the conversation well with a friendly greeting, demonstrating good social awareness",
            "You effectively introduced the main topic of discussion by bringing up the project timeline",
            "You could be more specific about what aspects of the timeline you wanted to discuss"
          ],
          "score": 8,
          "summary": "Strong conversation starter with good initiative but could add more specificity"
        },
        "participant2": {
          "bullets": [
            "You responded positively and showed courtesy by asking about the other person too",
            "You demonstrated active listening by asking a specific follow-up question about the timeline",
            "You could provide more context or information instead of just asking questions"
          ],
          "score": 7,
          "summary": "Good listening skills but could contribute more substantive content"
        },
        "overall": {
          "bullets": [
            "The conversation had a positive and professional tone",
            "Both participants engaged in turn-taking appropriately",
            "The conversation could benefit from more specific details and information exchange"
          ],
          "summary": "Professional and courteous exchange that needs more depth and specificity"
        }
      };
      
      res.json({
        ...mockFeedback,
        note: `Using sample feedback due to API error: ${errorMessage}. ${isQuotaError ? 'Your API key is valid but has reached its usage limit.' : 'Please check your OpenAI API key configuration.'}`
      });
    }
  } catch (error: any) {
    console.error("Error generating feedback:", error);
    res.status(500).json({ error: "Failed to generate feedback", message: error.message });
  }
}
