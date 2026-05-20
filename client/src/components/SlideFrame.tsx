interface Props {
  imageDataUrl: string;
}

export default function SlideFrame({ imageDataUrl }: Props) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <img
        src={imageDataUrl}
        alt="Presentation slide"
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}
