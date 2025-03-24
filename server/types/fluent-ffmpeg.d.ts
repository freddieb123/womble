declare module 'fluent-ffmpeg' {
  function ffmpeg(input?: string | ReadableStream): FfmpegCommand;
  
  namespace ffmpeg {
    function setFfmpegPath(path: string): void;
    function setFfprobePath(path: string): void;
    function setFlvtoolPath(path: string): void;
    
    interface FfmpegCommand {
      output(output: string): FfmpegCommand;
      audioCodec(codec: string): FfmpegCommand;
      audioQuality(quality: number): FfmpegCommand;
      audioChannels(channels: number): FfmpegCommand;
      noVideo(): FfmpegCommand;
      on(event: string, callback: Function): FfmpegCommand;
      run(): void;
    }
  }
  
  export = ffmpeg;
}