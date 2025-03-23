
import type { Request, Response } from "express";
import { db } from "@db";
import { chatConfigs, dualConversations } from "@db/schema";
import { eq, and } from "drizzle-orm";
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

const upload = multer({ storage: storage });

export const saveAudio = upload.single('audio');

export async function handleSaveAudio(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const { configId, sessionId, participant1Name, participant2Name } = req.body;

    if (!configId || !sessionId) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const audioUrl = `/uploads/${req.file.filename}`;

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
    res.status(500).json({ error: error.message });
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

    // Transcribe the audio using OpenAI
    const audioStream = fs.createReadStream(audioFilePath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: "whisper-1",
    });

    // Use a separate API call to identify speakers and segment the conversation
    const speakerDetectionPrompt = `
    This is a transcription of a conversation between two people: ${participant1Name} and ${participant2Name}.
    Please analyze this text and separate it into individual turns, identifying which person is speaking for each part.
    Format your response as a JSON array where each object has:
    1. "role": either "participant1" or "participant2"
    2. "content": the text spoken by that participant
    3. "timestamp": estimate the timestamp in seconds from the start of the conversation

    Transcription:
    ${transcription.text}
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing conversations and identifying speakers. Your job is to parse a transcription into speaker turns, formatting the output as a valid JSON array."
        },
        {
          role: "user",
          content: speakerDetectionPrompt
        }
      ],
      response_format: { type: "json_object" },
    });

    // Parse the response
    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error("Failed to get response from OpenAI");
    }
    
    try {
      const parsedResponse = JSON.parse(responseContent);
      // The AI might return an array directly or it might put it under a transcript key
      const transcript = Array.isArray(parsedResponse) ? parsedResponse : 
                        (parsedResponse.transcript || []);
      
      // No database storage - just return the transcript
      res.json({
        success: true,
        transcript,
        participant1Name,
        participant2Name
      });
    } catch (parseError) {
      console.error("Error parsing transcript:", parseError);
      res.status(500).json({ error: "Failed to parse transcript response" });
    }
  } catch (error: any) {
    console.error("Error transcribing audio:", error);
    res.status(500).json({ error: error.message });
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

    // Get the config with feedback criteria
    const config = await db.query.chatConfigs.findFirst({
      where: eq(chatConfigs.id, configId)
    });

    if (!config || !config.feedbackCriteria) {
      return res.status(400).json({ error: "Feedback criteria not found for this configuration" });
    }

    // Format the transcript for analysis
    const transcriptText = transcript
      .map((entry: any) => `${entry.role === 'participant1' ? participant1Name : participant2Name}: ${entry.content}`)
      .join('\n');

    // Create the feedback prompt
    const prompt = `
    Context: ${config.systemPrompt}
    
    Analyze this conversation between ${participant1Name} and ${participant2Name} based on these criteria:
    ${config.feedbackCriteria}
    
    Please provide separate feedback for each participant, addressing them directly using "you" instead of their name or "the participant".
    
    Format your response in JSON exactly like this:
    {
      "participant1": {
        "bullets": ["3 specific points of feedback for participant 1, using 'you' language", "second point", "third point"],
        "score": [1-10 score],
        "summary": "Brief one-line summary of overall performance"
      },
      "participant2": {
        "bullets": ["3 specific points of feedback for participant 2, using 'you' language", "second point", "third point"],
        "score": [1-10 score],
        "summary": "Brief one-line summary of overall performance"
      },
      "overall": {
        "bullets": ["3 observations about the conversation as a whole"],
        "summary": "Brief one-line summary of the conversation quality"
      }
    }
    
    Conversation to analyze:
    ${transcriptText}
    `;

    // Generate feedback using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing conversations and providing constructive feedback. Focus on specific behaviors and provide actionable feedback for improvement."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error("Failed to get response from OpenAI");
    }

    try {
      const feedbackData = JSON.parse(responseContent);
      
      // No database storage needed - just return the feedback
      res.json(feedbackData);
    } catch (parseError) {
      console.error("Error parsing feedback:", parseError);
      res.status(500).json({ error: "Failed to parse feedback response" });
    }
  } catch (error: any) {
    console.error("Error generating feedback:", error);
    res.status(500).json({ error: error.message });
  }
}
