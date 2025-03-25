
import type { Request, Response } from "express";
import { db } from "@db";
import { chatConfigs, dualConversations } from "@db/schema";
import { eq, and } from "drizzle-orm";
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

// Configure ffmpeg with the static binary path
ffmpeg.setFfmpegPath(ffmpegStatic as string);

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

// Helper function for exponential backoff
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to convert audio file to MP3 format
async function convertAudioToMp3(inputPath: string): Promise<string> {
  const outputPath = inputPath.replace(/\.[^/.]+$/, "") + ".mp3";
  
  return new Promise((resolve, reject) => {
    console.log(`Converting audio file from ${inputPath} to ${outputPath}`);
    
    ffmpeg(inputPath)
      .output(outputPath)
      .audioCodec('libmp3lame')
      .audioQuality(3) // Medium quality, 0-9 (0 is best)
      .audioChannels(1) // Mono for better speech recognition
      .noVideo()
      .on('start', (commandLine) => {
        console.log('FFmpeg conversion started:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Conversion progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('error', (err) => {
        console.error('Error converting audio:', err);
        reject(err);
      })
      .on('end', () => {
        console.log('Audio conversion completed successfully');
        resolve(outputPath);
      })
      .run();
  });
};

// Function to attempt API call with retries
async function retryOpenAICall<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`API call attempt ${attempt}/${maxRetries}`);
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on specific errors
      if (error.status === 400 || // Bad request
          (error.message && error.message.includes("quota")) || // Quota exceeded
          (error.message && error.message.includes("billing"))) { // Billing issues
        console.error(`Error not eligible for retry:`, error.message);
        throw error;
      }
      
      // Connection errors are good candidates for retry
      const isConnectionError = 
        error.message?.includes("ECONNRESET") || 
        error.message?.includes("socket hang up") ||
        error.message?.includes("network") ||
        error.message?.includes("timeout") ||
        error.message?.includes("Connection") ||
        error.message?.includes("connect");
      
      if (!isConnectionError) {
        console.error(`Non-connection error, not retrying:`, error.message);
        throw error;
      }
      
      if (attempt < maxRetries) {
        // Exponential backoff: wait 2^attempt * 1000ms
        const backoffTime = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Connection error, retrying in ${backoffTime}ms...`, error.message);
        await delay(backoffTime);
      } else {
        console.error(`Failed after ${maxRetries} attempts:`, error);
        throw error;
      }
    }
  }
  
  throw lastError;
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
      return res.status(404).json({ 
        error: "Audio file not found on disk",
        message: `The file at ${audioUrl} was not found. The upload may have failed.`
      });
    }

    try {
      console.log(`Transcribing audio file: ${audioFilePath}`);
      
      // Check the file size before sending
      const stats = fs.statSync(audioFilePath);
      console.log(`Audio file size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      if (stats.size === 0) {
        throw new Error("Audio file is empty (0 bytes)");
      }
      
      if (stats.size > 25 * 1024 * 1024) { // 25MB OpenAI limit
        throw new Error(`Audio file size (${(stats.size / 1024 / 1024).toFixed(2)} MB) exceeds OpenAI's 25MB limit`);
      }
      
      // Try to validate the file format - make sure it's a properly formatted audio file
      try {
        // Read a small piece of the file to verify it's not corrupted
        const fileHeader = Buffer.alloc(16);
        const fd = fs.openSync(audioFilePath, 'r');
        fs.readSync(fd, fileHeader, 0, 16, 0);
        fs.closeSync(fd);
        
        // Log the header bytes for debugging
        console.log("File header bytes:", fileHeader.toString('hex'));
      } catch (readError) {
        console.error("Error reading file header:", readError);
        // Continue anyway - the error handling below will catch any issues
      }
      
      // Try to convert the audio file to a more compatible format (MP3)
      let fileToTranscribe = audioFilePath;
      try {
        console.log("Attempting to convert audio to MP3 format...");
        fileToTranscribe = await convertAudioToMp3(audioFilePath);
        console.log(`Using converted file for transcription: ${fileToTranscribe}`);
        
        // Check converted file size
        const convertedStats = fs.statSync(fileToTranscribe);
        console.log(`Converted file size: ${convertedStats.size} bytes (${(convertedStats.size / 1024 / 1024).toFixed(2)} MB)`);
        
        if (convertedStats.size === 0) {
          throw new Error("Converted audio file is empty (0 bytes)");
        }
      } catch (conversionError) {
        console.error("Error converting audio:", conversionError);
        console.log("Proceeding with original file format...");
        // Continue with the original file if conversion fails
      }
      
      // Use our retry function for API call
      const transcription = await retryOpenAICall(async () => {
        // Create a readable stream from the file for each attempt
        const audioFile = fs.createReadStream(fileToTranscribe);
        
        // Call OpenAI API to transcribe the audio
        return await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          response_format: "verbose_json",
          timestamp_granularities: ["segment"]
        });
      }, 3); // try up to 3 times
      
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
        if (index > 0 && segment.text.trim().length > 0) {
          currentSpeaker = currentSpeaker === "participant1" ? "participant2" : "participant1";
        }
        
        return {
          role: currentSpeaker,
          content: segment.text.trim(),
          timestamp: segment.start
        };
      }).filter(entry => entry.content.length > 0); // Remove empty segments
      
      // Store the transcript in the database
      try {
        // First check if a record already exists
        const existingRecord = await db.select()
          .from(dualConversations)
          .where(and(
            eq(dualConversations.configId, configId),
            eq(dualConversations.sessionId, sessionId)
          ))
          .execute();
        
        if (existingRecord.length > 0) {
          // Update existing record
          await db.update(dualConversations)
            .set({
              participant1Name,
              participant2Name,
              transcript: JSON.stringify(transcript),
              audioUrl
            })
            .where(and(
              eq(dualConversations.configId, configId),
              eq(dualConversations.sessionId, sessionId)
            ))
            .execute();
            
          console.log(`Updated existing transcript record for session ${sessionId}`);
        } else {
          // Insert new record
          await db.insert(dualConversations)
            .values({
              configId,
              sessionId,
              participant1Name,
              participant2Name,
              transcript: JSON.stringify(transcript),
              audioUrl
            })
            .execute();
            
          console.log(`Saved new transcript record for session ${sessionId}`);
        }
      } catch (dbError) {
        console.error("Database error saving transcript:", dbError);
        // Continue even if DB save fails - we'll still return the data to the client
      }
      
      // Return the processed transcript
      res.json({
        success: true,
        transcript,
        participant1Name,
        participant2Name
      });
      
    } catch (openaiError: any) {
      console.error("OpenAI API Error:", openaiError);
      
      // Check for various error types to provide better messages
      let errorType = "unknown";
      let errorMessage = openaiError.message || 'Unknown error';
      
      if (openaiError.message) {
        if (openaiError.message.includes("quota")) {
          errorType = "quota";
          errorMessage = "OpenAI API quota exceeded. Please check your billing details on your OpenAI account.";
        } else if (openaiError.message.includes("ECONNRESET") || 
                 openaiError.message.includes("socket hang up") ||
                 openaiError.message.includes("network") ||
                 openaiError.message.includes("connect")) {
          errorType = "connection";
          errorMessage = "Connection to OpenAI API failed. This might be a temporary network issue.";
        } else if (openaiError.message.includes("too large") ||
                 openaiError.message.includes("file size")) {
          errorType = "file_size";
          errorMessage = "Audio file is too large for OpenAI API. The maximum file size is 25MB.";
        } else if (openaiError.message.includes("format") ||
                 openaiError.message.includes("unsupported")) {
          errorType = "file_format";
          errorMessage = "Audio file format not supported by OpenAI API. Try a different format like MP3, M4A, WAV, or WebM.";
        } else if (openaiError.message.includes("authorization") ||
                 openaiError.message.includes("authentication") ||
                 openaiError.message.includes("key")) {
          errorType = "auth";
          errorMessage = "OpenAI API key is invalid or not properly configured.";
        }
      }
      
      // Use authentic data only for error cases - return empty array with error information
      const emptyTranscript = [];
      
      // Send a detailed error response to the client
      res.json({
        success: false,
        transcript: emptyTranscript,
        participant1Name,
        participant2Name,
        error: {
          type: errorType,
          message: errorMessage,
          details: openaiError.toString()
        }
      });
    }
  } catch (error: any) {
    console.error("Error transcribing audio:", error);
    
    // Provide more detailed error information
    let statusCode = 500;
    let errorMessage = error.message || "Failed to transcribe audio";
    
    if (error.message && error.message.includes("not found")) {
      statusCode = 404;
    } else if (error.message && (
      error.message.includes("required") || 
      error.message.includes("invalid") ||
      error.message.includes("missing")
    )) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      error: "Failed to transcribe audio", 
      message: errorMessage,
      details: error.toString()
    });
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

      // Use our retry function for the OpenAI API call
      const completion = await retryOpenAICall(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: conversationText }
          ],
          temperature: 0.7,
          response_format: { type: "json_object" }
        });
      }, 3); // Try up to 3 times
      
      const responseContent = completion.choices[0].message.content;
      console.log("OpenAI API response received successfully");
      
      if (!responseContent) {
        throw new Error("Empty response from OpenAI API");
      }
      
      // Parse the JSON response
      const feedbackData = JSON.parse(responseContent);
      
      // Store the feedback in the database
      try {
        // Update the existing record with the feedback
        await db.update(dualConversations)
          .set({
            feedback: JSON.stringify(feedbackData)
          })
          .where(and(
            eq(dualConversations.configId, configId),
            eq(dualConversations.sessionId, sessionId)
          ))
          .execute();
          
        console.log(`Updated record with feedback for session ${sessionId}`);
      } catch (dbError) {
        console.error("Database error saving feedback:", dbError);
        // Continue even if DB save fails - we'll still return the data to the client
      }
      
      // Return the feedback to the client
      res.json(feedbackData);
      
    } catch (openaiError: any) {
      console.error("OpenAI API Error:", openaiError);
      
      // Check for various error types to provide better messages
      let errorType = "unknown";
      let errorMessage = openaiError.message || 'Unknown error';
      
      if (openaiError.message) {
        if (openaiError.message.includes("quota")) {
          errorType = "quota";
          errorMessage = "OpenAI API quota exceeded. Please check your billing details on your OpenAI account.";
        } else if (openaiError.message.includes("ECONNRESET") || 
                 openaiError.message.includes("socket hang up") ||
                 openaiError.message.includes("network") ||
                 openaiError.message.includes("connect")) {
          errorType = "connection";
          errorMessage = "Connection to OpenAI API failed. This might be a temporary network issue.";
        } else if (openaiError.message.includes("authorization") ||
                 openaiError.message.includes("authentication") ||
                 openaiError.message.includes("key")) {
          errorType = "auth";
          errorMessage = "OpenAI API key is invalid or not properly configured.";
        }
      }
      
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
      
      // Send a detailed response to the client
      res.json({
        ...mockFeedback,
        error: {
          type: errorType,
          message: errorMessage,
          details: openaiError.toString()
        },
        note: `Using sample feedback due to API error: ${errorMessage}`
      });
    }
  } catch (error: any) {
    console.error("Error generating feedback:", error);
    
    // Provide more detailed error information
    let statusCode = 500;
    let errorMessage = error.message || "Failed to generate feedback";
    
    if (error.message && (error.message.includes("required") || 
                        error.message.includes("invalid") ||
                        error.message.includes("missing"))) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      error: "Failed to generate feedback", 
      message: errorMessage,
      details: error.toString()
    });
  }
}
